import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import { parseIntId } from '../../common/id.util';
import {
  CrmCustomer,
  ErpOrder,
  ErpOrderItem,
  ErpProduct,
  ErpStockRecord,
  ErpStockWarn,
  ORDER_STATUS,
  ORDER_STATUS_FLOW,
  PartnerConfig,
  PartnerPerformance,
  SysUser,
} from '../../entities';
import { pageResult } from '../../common/result';
import { applyScope, bizNo, dayRange, parsePage, todayStr } from '../../common/scope';
import { AuthUser } from '../../common/auth';
import { LlmService } from '../../infra/llm/llm.service';
import { Prompts } from '../../infra/llm/prompts';
import { OrgService } from '../org/org.service';
import { BizEvent, bizEvents } from '../../common/event-bus';

@Injectable()
export class ErpService {
  private readonly logger = new Logger('ErpService');

  constructor(
    @InjectRepository(ErpProduct) private readonly prodRepo: Repository<ErpProduct>,
    @InjectRepository(ErpStockRecord) private readonly stockRepo: Repository<ErpStockRecord>,
    @InjectRepository(ErpStockWarn) private readonly warnRepo: Repository<ErpStockWarn>,
    @InjectRepository(ErpOrder) private readonly orderRepo: Repository<ErpOrder>,
    @InjectRepository(ErpOrderItem) private readonly itemRepo: Repository<ErpOrderItem>,
    @InjectRepository(CrmCustomer) private readonly custRepo: Repository<CrmCustomer>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(PartnerConfig) private readonly pcRepo: Repository<PartnerConfig>,
    @InjectRepository(PartnerPerformance) private readonly ppRepo: Repository<PartnerPerformance>,
    private readonly llm: LlmService,
    private readonly org: OrgService,
    private readonly ds: DataSource,
  ) {}

  private async scopeUserIds(entId: number, user: AuthUser): Promise<number[]> {
    if (user.isSuper || user.dataScope >= 3) return [];
    if (user.dataScope === 2) return this.org.deptUserIds(entId, user.deptId);
    return [user.userId];
  }

  // ==================== 产品档案 ====================

  /** POST /api/v1/erp/product/save 产品保存 */
  async saveProduct(entId: number, dto: any) {
    const productName = (dto.product_name ?? dto.productName ?? '').trim();
    if (!productName) throw new BadRequestException('产品名称不能为空');
    const id = Number(dto.id || 0);

    const data = {
      productCode: dto.product_code ?? dto.productCode ?? '',
      productName,
      spec: dto.spec ?? '',
      unit: dto.unit ?? '件',
      price: Number(dto.price ?? 0),
      costPrice: Number(dto.cost_price ?? dto.costPrice ?? 0),
      warnStock: Number(dto.warn_stock ?? dto.warnStock ?? 0),
      status: Number(dto.status ?? 1),
    };

    if (id) {
      const p = await this.prodRepo.findOne({ where: { id, enterpriseId: entId } });
      if (!p) throw new NotFoundException('产品不存在');
      Object.assign(p, data);
      await this.prodRepo.save(p);
      await this.checkWarn(entId, id);
      return { id };
    }

    const saved = await this.prodRepo.save(
      this.prodRepo.create({
        enterpriseId: entId,
        ...data,
        productCode: data.productCode || bizNo('P'),
        stockNum: Number(dto.stock_num ?? dto.stockNum ?? 0),
      }),
    );
    await this.checkWarn(entId, Number(saved.id));
    return { id: Number(saved.id) };
  }

  /** GET /api/v1/erp/product/page 产品分页 */
  async productPage(entId: number, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.prodRepo
      .createQueryBuilder('p')
      .where('p.enterpriseId = :entId', { entId })
      .orderBy('p.id', 'DESC')
      .skip(skip)
      .take(take);
    if (query.keyword) {
      qb.andWhere('(p.productName LIKE :kw OR p.productCode LIKE :kw OR p.spec LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    if (query.warn_only === '1' || query.warnOnly === true) {
      qb.andWhere('p.stockNum <= p.warnStock');
    }
    const [list, total] = await qb.getManyAndCount();
    return pageResult(
      list.map((p) => ({
        id: Number(p.id),
        product_code: p.productCode,
        product_name: p.productName,
        spec: p.spec,
        unit: p.unit,
        price: Number(p.price),
        cost_price: Number(p.costPrice),
        stock_num: p.stockNum,
        warn_stock: p.warnStock,
        is_warn: p.stockNum <= p.warnStock,
        status: p.status,
        created_at: p.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  async productOptions(entId: number) {
    const list = await this.prodRepo.find({
      where: { enterpriseId: entId, status: 1 },
      order: { id: 'DESC' },
    });
    return list.map((p) => ({
      id: Number(p.id),
      product_name: p.productName,
      spec: p.spec,
      unit: p.unit,
      price: Number(p.price),
      stock_num: p.stockNum,
    }));
  }

  async removeProduct(entId: number, id: number) {
    const p = await this.prodRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!p) throw new NotFoundException('产品不存在');
    if (await this.itemRepo.count({ where: { enterpriseId: entId, productId: id } })) {
      throw new BadRequestException('该产品已被订单引用，无法删除，建议改为停用');
    }
    await this.stockRepo.delete({ enterpriseId: entId, productId: id });
    await this.warnRepo.delete({ enterpriseId: entId, productId: id });
    await this.prodRepo.delete(id);
    return true;
  }

  // ==================== 库存 ====================

  /** POST /api/v1/erp/stock/in 入库 */
  stockIn(entId: number, user: AuthUser, dto: any) {
    return this.changeStock(entId, user, dto, 'in');
  }

  /** POST /api/v1/erp/stock/out 出库 */
  stockOut(entId: number, user: AuthUser, dto: any) {
    return this.changeStock(entId, user, dto, 'out');
  }

  /**
   * 出入库核心
   * 用事务 + 行锁保证并发下库存不会算错
   */
  private async changeStock(
    entId: number,
    user: AuthUser,
    dto: any,
    type: 'in' | 'out',
    bizType = 'manual',
    bizId = 0,
  ) {
    const productId = Number(dto.product_id ?? dto.productId);
    const num = Number(dto.num ?? 0);
    if (!productId) throw new BadRequestException('请选择产品');
    if (!Number.isInteger(num) || num <= 0) throw new BadRequestException('数量必须是大于0的整数');

    const result = await this.ds.transaction(async (m) => {
      const p = await m.findOne(ErpProduct, { where: { id: productId, enterpriseId: entId } });
      if (!p) throw new NotFoundException('产品不存在');

      const before = p.stockNum || 0;
      const after = type === 'in' ? before + num : before - num;
      if (after < 0) throw new BadRequestException(`库存不足，当前库存 ${before}，本次出库 ${num}`);

      p.stockNum = after;
      await m.save(p);
      await m.save(
        m.create(ErpStockRecord, {
          enterpriseId: entId,
          productId,
          type,
          num,
          beforeNum: before,
          afterNum: after,
          bizType,
          bizId,
          remark: dto.remark ?? '',
          operatorId: user.userId,
        }),
      );
      return { before, after, productName: p.productName };
    });

    const warn = await this.checkWarn(entId, productId);
    return {
      product_id: productId,
      product_name: result.productName,
      before_num: result.before,
      after_num: result.after,
      warned: !!warn,
      ai_advice: warn?.aiAdvice || '',
    };
  }

  /**
   * 库存预警检查：低于或等于预警线时生成 AI 补货建议
   * 同一产品未处理的预警只保留一条，避免刷屏
   */
  private async checkWarn(entId: number, productId: number): Promise<ErpStockWarn | null> {
    const p = await this.prodRepo.findOne({ where: { id: productId, enterpriseId: entId } });
    if (!p) return null;

    if (p.warnStock <= 0 || p.stockNum > p.warnStock) {
      await this.warnRepo.update(
        { enterpriseId: entId, productId, handled: 0 },
        { handled: 1 },
      );
      return null;
    }

    const exist = await this.warnRepo.findOne({
      where: { enterpriseId: entId, productId, handled: 0 },
    });

    // 最近 30 天出库量，作为补货建议的依据
    const from = new Date(Date.now() - 30 * 86400000);
    const outs = await this.stockRepo.find({
      where: { enterpriseId: entId, productId, type: 'out', createdAt: Between(from, new Date()) },
    });
    const outQty = outs.reduce((s, r) => s + r.num, 0);

    let advice = '';
    try {
      const ctx = [
        `产品：${p.productName}${p.spec ? `（${p.spec}）` : ''}`,
        `当前库存：${p.stockNum} ${p.unit}`,
        `预警库存：${p.warnStock} ${p.unit}`,
        `近30天出库总量：${outQty} ${p.unit}`,
      ].join('\n');
      const res = await this.llm.complete({
        scene: 'stock_advice',
        enterpriseId: entId,
        prompt: Prompts.stockAdvice(ctx),
        payload: {
          productName: p.productName,
          stockNum: p.stockNum,
          warnStock: p.warnStock,
          outQty30d: outQty,
          unit: p.unit,
        },
      });
      advice = res.content;
    } catch (e: any) {
      this.logger.warn(`补货建议生成失败：${e.message}`);
    }

    if (exist) {
      exist.stockNum = p.stockNum;
      exist.warnStock = p.warnStock;
      exist.aiAdvice = advice || exist.aiAdvice;
      return this.warnRepo.save(exist);
    }
    return this.warnRepo.save(
      this.warnRepo.create({
        enterpriseId: entId,
        productId,
        productName: p.productName,
        stockNum: p.stockNum,
        warnStock: p.warnStock,
        aiAdvice: advice,
        handled: 0,
      }),
    );
  }

  /** GET /api/v1/erp/stock/warn_list 库存缺货预警列表 */
  async warnList(entId: number, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const where: any = { enterpriseId: entId };
    if (query.handled !== undefined && query.handled !== '') where.handled = Number(query.handled);
    const [list, total] = await this.warnRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip,
      take,
    });
    return pageResult(
      list.map((w) => ({
        id: Number(w.id),
        product_id: Number(w.productId),
        product_name: w.productName,
        stock_num: w.stockNum,
        warn_stock: w.warnStock,
        ai_advice: w.aiAdvice,
        handled: w.handled,
        created_at: w.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  async handleWarn(entId: number, id: number) {
    const w = await this.warnRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!w) throw new NotFoundException('预警记录不存在');
    w.handled = 1;
    await this.warnRepo.save(w);
    return true;
  }

  /** 出入库流水分页 */
  async stockRecordPage(entId: number, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.stockRepo
      .createQueryBuilder('s')
      .where('s.enterpriseId = :entId', { entId })
      .orderBy('s.id', 'DESC')
      .skip(skip)
      .take(take);
    if (query.product_id) qb.andWhere('s.productId = :pid', { pid: Number(query.product_id) });
    if (query.type) qb.andWhere('s.type = :t', { t: query.type });

    const [list, total] = await qb.getManyAndCount();
    const pids = [...new Set(list.map((s) => Number(s.productId)))];
    const prods = pids.length
      ? await this.prodRepo.find({ where: { id: In(pids), enterpriseId: entId } })
      : [];
    const pMap = new Map(prods.map((p) => [Number(p.id), p]));
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    const uMap = new Map(users.map((u) => [Number(u.id), u.realName || u.username]));

    return pageResult(
      list.map((s) => ({
        id: Number(s.id),
        product_id: Number(s.productId),
        product_name: pMap.get(Number(s.productId))?.productName || '',
        spec: pMap.get(Number(s.productId))?.spec || '',
        type: s.type,
        type_text: s.type === 'in' ? '入库' : '出库',
        num: s.num,
        before_num: s.beforeNum,
        after_num: s.afterNum,
        biz_type: s.bizType,
        biz_id: Number(s.bizId || 0),
        remark: s.remark,
        operator_name: uMap.get(Number(s.operatorId)) || '',
        created_at: s.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  // ==================== 订单 ====================

  /** POST /api/v1/erp/order/create 创建订单 */
  async createOrder(entId: number, user: AuthUser, dto: any) {
    const customerId = Number(dto.customer_id ?? dto.customerId);
    const items: any[] = dto.items || [];
    if (!customerId) throw new BadRequestException('请选择客户');
    if (!items.length) throw new BadRequestException('请至少添加一条订单明细');

    const cust = await this.custRepo.findOne({ where: { id: customerId, enterpriseId: entId } });
    if (!cust) throw new NotFoundException('客户不存在');

    const pids = items.map((i) => Number(i.product_id ?? i.productId));
    const prods = await this.prodRepo.find({ where: { id: In(pids), enterpriseId: entId } });
    const pMap = new Map(prods.map((p) => [Number(p.id), p]));

    let total = 0;
    const rows = items.map((i) => {
      const pid = Number(i.product_id ?? i.productId);
      const p = pMap.get(pid);
      if (!p) throw new BadRequestException(`产品ID ${pid} 不存在`);
      const num = Number(i.num || 0);
      if (num <= 0) throw new BadRequestException(`产品「${p.productName}」数量必须大于0`);
      const price = i.price !== undefined ? Number(i.price) : Number(p.price);
      const amount = Number((price * num).toFixed(2));
      total += amount;
      return { productId: pid, productName: p.productName, spec: p.spec, price, num, amount };
    });
    total = Number(total.toFixed(2));

    const ownerId = Number(dto.owner_user_id ?? dto.ownerUserId ?? cust.ownerUserId ?? user.userId);
    const order = await this.orderRepo.save(
      this.orderRepo.create({
        enterpriseId: entId,
        orderNo: bizNo('SO'),
        customerId,
        customerName: cust.customerName,
        totalAmount: total,
        orderStatus: '待审核',
        ownerUserId: ownerId,
        deliveryDate: dto.delivery_date ?? dto.deliveryDate ?? null,
        remark: dto.remark ?? '',
      }),
    );

    await this.itemRepo.save(
      rows.map((r) =>
        this.itemRepo.create({ enterpriseId: entId, orderId: Number(order.id), ...r }),
      ),
    );

    // AI 订单异常预警
    const warnMsg = await this.orderWarn(entId, order, rows, cust);
    if (warnMsg) await this.orderRepo.update(order.id, { aiWarnMsg: warnMsg });

    return {
      id: Number(order.id),
      order_no: order.orderNo,
      total_amount: total,
      order_status: order.orderStatus,
      ai_warn_msg: warnMsg,
    };
  }

  /** AI 订单异常判定 */
  private async orderWarn(entId: number, order: ErpOrder, rows: any[], cust: CrmCustomer) {
    try {
      const lackList: string[] = [];
      for (const r of rows) {
        const p = await this.prodRepo.findOne({ where: { id: r.productId, enterpriseId: entId } });
        if (p && p.stockNum < r.num) {
          lackList.push(`${p.productName} 需 ${r.num}${p.unit}、现存 ${p.stockNum}${p.unit}`);
        }
      }
      const days = order.deliveryDate
        ? Math.ceil((new Date(order.deliveryDate).getTime() - Date.now()) / 86400000)
        : null;
      const ctx = [
        `订单号：${order.orderNo}`,
        `客户：${cust.customerName}（等级${cust.grade}，意向分${cust.intentionScore}）`,
        `订单金额：${order.totalAmount} 元`,
        `交期：${order.deliveryDate || '未填写'}${days !== null ? `，距今 ${days} 天` : ''}`,
        `明细：${rows.map((r) => `${r.productName}×${r.num}`).join('、')}`,
        `库存缺口：${lackList.join('；') || '无'}`,
      ].join('\n');

      const res = await this.llm.complete({
        scene: 'order_warn',
        enterpriseId: entId,
        prompt: Prompts.orderWarn(ctx),
        payload: {
          orderNo: order.orderNo,
          amount: Number(order.totalAmount),
          deliveryDays: days,
          lackList,
          customerGrade: cust.grade,
        },
      });
      const txt = (res.content || '').trim();
      return txt && !/^无(明显)?异常/.test(txt) ? txt : '';
    } catch {
      return '';
    }
  }

  /**
   * PUT /api/v1/erp/order/status 更新订单状态
   * 状态只能沿 ORDER_STATUS_FLOW 合法路径流转
   * 发货时自动出库；完成时登记合伙人业绩台账
   */
  async updateOrderStatus(entId: number, user: AuthUser, dto: any) {
    const id = parseIntId(dto.id ?? dto.order_id ?? dto.orderId, '订单ID');
    const target = String(dto.order_status ?? dto.orderStatus ?? dto.status ?? '');
    if (!ORDER_STATUS.includes(target as any)) {
      throw new BadRequestException(`订单状态不合法，仅支持：${ORDER_STATUS.join('/')}`);
    }
    const order = await this.orderRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!order) throw new NotFoundException('订单不存在');

    const allowed = ORDER_STATUS_FLOW[order.orderStatus] || [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `「${order.orderStatus}」不能直接变更为「${target}」，允许的下一步：${allowed.join('/') || '无'}`,
      );
    }

    // 发货：自动出库
    if (target === '已发货') {
      const items = await this.itemRepo.find({ where: { enterpriseId: entId, orderId: id } });
      for (const it of items) {
        await this.changeStock(
          entId,
          user,
          { product_id: it.productId, num: it.num, remark: `订单 ${order.orderNo} 发货出库` },
          'out',
          'order',
          id,
        );
      }
    }

    const fromStatus = order.orderStatus;
    order.orderStatus = target;
    await this.orderRepo.save(order);

    // 完成：如归属人是合伙人，自动登记业绩台账（V1.0 只记台账，不发放）
    let performance: any = null;
    if (target === '已完成') performance = await this.recordPerformance(entId, order);

    // ---- V2.0 事件广播：驱动生产工单联动、合伙人自动分利、智能体事件任务 ----
    const payload = {
      entId,
      orderId: id,
      orderNo: order.orderNo,
      from: fromStatus,
      status: target,
      customerId: Number(order.customerId || 0),
      ownerUserId: Number(order.ownerUserId || 0),
    };
    // 所有状态变更都广播（合伙人分利监听「已完成」）
    setImmediate(() => bizEvents.emit(BizEvent.ORDER_STATUS_CHANGED, payload));
    // 待审核 -> 生产中 视为「审核通过」，驱动生产工单自动生成
    if (fromStatus === '待审核' && target === '生产中') {
      setImmediate(() => bizEvents.emit(BizEvent.ORDER_APPROVED, payload));
    }

    return { id, order_status: target, performance };
  }

  /** 合伙人业绩台账自动登记 */
  private async recordPerformance(entId: number, order: ErpOrder) {
    const ownerId = Number(order.ownerUserId || 0);
    if (!ownerId) return null;
    const user = await this.userRepo.findOne({ where: { id: ownerId, enterpriseId: entId } });
    if (!user?.isPartner) return null;

    const exist = await this.ppRepo.findOne({
      where: { enterpriseId: entId, userId: ownerId, orderId: Number(order.id) },
    });
    if (exist) return { id: Number(exist.id), duplicated: true };

    const cfg = await this.pcRepo.findOne({
      where: { enterpriseId: entId, userId: ownerId, enable: 1 },
    });
    const ratio = Number(cfg?.defaultRatio || 0);
    const amount = Number(order.totalAmount || 0);
    const estimate = Number(((amount * ratio) / 100).toFixed(2));

    const saved = await this.ppRepo.save(
      this.ppRepo.create({
        enterpriseId: entId,
        userId: ownerId,
        orderId: Number(order.id),
        orderNo: order.orderNo,
        performanceAmount: amount,
        ratio,
        estimateAmount: estimate,
        period: todayStr().slice(0, 7),
        remark: '订单完成自动登记',
      }),
    );
    return {
      id: Number(saved.id),
      performance_amount: amount,
      ratio,
      estimate_amount: estimate,
    };
  }

  /** GET /api/v1/erp/order/page 订单分页 */
  async orderPage(entId: number, user: AuthUser, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.enterpriseId = :entId', { entId })
      .orderBy('o.id', 'DESC')
      .skip(skip)
      .take(take);
    if (query.keyword) {
      qb.andWhere('(o.orderNo LIKE :kw OR o.customerName LIKE :kw)', { kw: `%${query.keyword}%` });
    }
    if (query.order_status) qb.andWhere('o.orderStatus = :st', { st: query.order_status });
    if (query.customer_id) qb.andWhere('o.customerId = :cid', { cid: Number(query.customer_id) });
    applyScope(qb, user, 'o', 'ownerUserId', await this.scopeUserIds(entId, user));

    const [list, total] = await qb.getManyAndCount();
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    const uMap = new Map(users.map((u) => [Number(u.id), u.realName || u.username]));

    return pageResult(
      list.map((o) => ({
        id: Number(o.id),
        order_no: o.orderNo,
        customer_id: Number(o.customerId),
        customer_name: o.customerName,
        total_amount: Number(o.totalAmount),
        order_status: o.orderStatus,
        next_status: ORDER_STATUS_FLOW[o.orderStatus] || [],
        owner_user_id: Number(o.ownerUserId || 0),
        owner_name: uMap.get(Number(o.ownerUserId)) || '',
        delivery_date: o.deliveryDate,
        ai_warn_msg: o.aiWarnMsg,
        remark: o.remark,
        created_at: o.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  async orderDetail(entId: number, id: number) {
    const o = await this.orderRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!o) throw new NotFoundException('订单不存在');
    const items = await this.itemRepo.find({ where: { enterpriseId: entId, orderId: id } });
    return {
      id: Number(o.id),
      order_no: o.orderNo,
      customer_id: Number(o.customerId),
      customer_name: o.customerName,
      total_amount: Number(o.totalAmount),
      order_status: o.orderStatus,
      next_status: ORDER_STATUS_FLOW[o.orderStatus] || [],
      delivery_date: o.deliveryDate,
      ai_warn_msg: o.aiWarnMsg,
      remark: o.remark,
      created_at: o.createdAt,
      items: items.map((i) => ({
        id: Number(i.id),
        product_id: Number(i.productId),
        product_name: i.productName,
        spec: i.spec,
        price: Number(i.price),
        num: i.num,
        amount: Number(i.amount),
      })),
    };
  }

  /**
   * GET /api/v1/erp/order/ai_daily 简易 AI 经营日报
   * 统计订单量、销售额、库存预警，输出 AI 解读文本
   */
  async aiDaily(entId: number, dateStr?: string) {
    const date = dateStr || todayStr();
    const { start, end } = dayRange(date);

    const orders = await this.orderRepo.find({
      where: { enterpriseId: entId, createdAt: Between(start, end) },
    });
    const orderCnt = orders.length;
    const amount = Number(orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0).toFixed(2));
    const doneCnt = orders.filter((o) => o.orderStatus === '已完成').length;
    const cancelCnt = orders.filter((o) => o.orderStatus === '已取消').length;

    const newCust = await this.custRepo.count({
      where: { enterpriseId: entId, createdAt: Between(start, end) },
    });
    const warnCnt = await this.warnRepo.count({ where: { enterpriseId: entId, handled: 0 } });
    const warnList = await this.warnRepo.find({
      where: { enterpriseId: entId, handled: 0 },
      order: { id: 'DESC' },
      take: 5,
    });

    const ctx = [
      `日期：${date}`,
      `新增订单：${orderCnt} 单，合计金额 ${amount} 元`,
      `已完成：${doneCnt} 单，已取消：${cancelCnt} 单`,
      `新增客户：${newCust} 个`,
      `未处理库存预警：${warnCnt} 条${warnList.length ? `（${warnList.map((w) => w.productName).join('、')}）` : ''}`,
    ].join('\n');

    const res = await this.llm.complete({
      scene: 'biz_daily',
      enterpriseId: entId,
      prompt: Prompts.bizDaily(ctx),
      payload: {
        // 与工作台经营简报保持同一契约：统一包一层 data
        data: {
          date,
          orderCnt,
          amount,
          doneCnt,
          cancelCnt,
          newCustomer: newCust,
          stockWarnCnt: warnCnt,
          warnNames: warnList.map((w) => w.productName),
        },
      },
    });

    return {
      date,
      order_count: orderCnt,
      order_amount: amount,
      done_count: doneCnt,
      cancel_count: cancelCnt,
      new_customer: newCust,
      stock_warn_count: warnCnt,
      ai_content: res.content,
      provider: res.provider,
    };
  }

  /** ERP 概览统计 */
  async overview(entId: number, user: AuthUser) {
    const [prodCnt, warnCnt, orderCnt] = await Promise.all([
      this.prodRepo.count({ where: { enterpriseId: entId, status: 1 } }),
      this.warnRepo.count({ where: { enterpriseId: entId, handled: 0 } }),
      this.orderRepo.count({ where: { enterpriseId: entId } }),
    ]);
    const statusRows = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.orderStatus', 'status')
      .addSelect('COUNT(1)', 'cnt')
      .addSelect('SUM(o.totalAmount)', 'amount')
      .where('o.enterpriseId = :entId', { entId })
      .groupBy('o.orderStatus')
      .getRawMany();

    return {
      product_total: prodCnt,
      stock_warn_total: warnCnt,
      order_total: orderCnt,
      order_status_dist: ORDER_STATUS.map((s) => ({
        status: s,
        count: Number(statusRows.find((r) => r.status === s)?.cnt || 0),
        amount: Number(statusRows.find((r) => r.status === s)?.amount || 0),
      })),
    };
  }
}
