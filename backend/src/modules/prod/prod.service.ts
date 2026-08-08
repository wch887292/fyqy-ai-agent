import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErpOrder, ErpOrderItem, ErpProduct, ErpStockRecord, ProdWorkOrder } from '../../entities';
import { AuthUser } from '../../common/auth';
import { pageResult, snakePage, toSnake } from '../../common/result';
import { bizNo, parsePage } from '../../common/scope';
import { LlmService } from '../../infra/llm/llm.service';
import { NoticeService } from '../notice/notice.service';
import { parseIntId } from '../../common/id.util';
import { bizEvents, BizEvent } from '../../common/event-bus';

/** 工单状态合法流转 */
export const WO_FLOW: Record<string, string[]> = {
  待排产: ['生产中', '已取消'],
  生产中: ['部分完成', '全部完工', '已取消'],
  部分完成: ['全部完工', '已取消'],
  全部完工: [],
  已取消: [],
};

/** 简易日产能（mock 工期估算用，生产可配置） */
const DAILY_CAPACITY = 200;

@Injectable()
export class ProdService {
  private readonly logger = new Logger('ProdService');

  constructor(
    @InjectRepository(ProdWorkOrder) private readonly woRepo: Repository<ProdWorkOrder>,
    @InjectRepository(ErpProduct) private readonly productRepo: Repository<ErpProduct>,
    @InjectRepository(ErpStockRecord) private readonly stockRepo: Repository<ErpStockRecord>,
    @InjectRepository(ErpOrder) private readonly orderRepo: Repository<ErpOrder>,
    @InjectRepository(ErpOrderItem) private readonly itemRepo: Repository<ErpOrderItem>,
    private readonly llm: LlmService,
    private readonly notice: NoticeService,
  ) {
    // 监听订单审核通过事件 -> 自动生成生产工单
    bizEvents.on(BizEvent.ORDER_APPROVED, (p: { entId: number; orderId: number; ownerUserId: number }) =>
      this.ensureWorkOrderForOrder(p.entId, p.orderId, p.ownerUserId).catch((e) =>
        this.logger.warn(`订单自动生成工单失败: ${e?.message}`),
      ),
    );
  }

  /** 订单审核通过：自动生成生产工单（事件驱动，幂等） */
  async ensureWorkOrderForOrder(entId: number, orderId: number, ownerUserId = 0) {
    const exist = await this.woRepo.findOne({ where: { enterpriseId: entId, orderId } });
    if (exist) return exist;
    const order = await this.orderRepo.findOne({ where: { id: orderId, enterpriseId: entId } });
    if (!order) return null;
    const items = await this.itemRepo.find({ where: { enterpriseId: entId, orderId } });
    if (!items.length) return null;
    // 一单多产品 -> 每个产品各生成一张工单
    const created: ProdWorkOrder[] = [];
    for (const it of items) {
      const product = await this.productRepo.findOne({ where: { id: it.productId, enterpriseId: entId } });
      const planFinish = new Date(Date.now() + 7 * 864e5);
      const wo = this.woRepo.create({
        enterpriseId: entId,
        orderId,
        workNo: bizNo('WO'),
        productId: it.productId,
        productName: product?.productName || it.productName,
        produceNum: it.num,
        finishNum: 0,
        status: '待排产',
        planFinishTime: planFinish,
        ownerUserId: ownerUserId || order.ownerUserId,
      });
      await this.woRepo.save(wo);
      await this.notice.send(
        entId,
        wo.ownerUserId,
        '订单已审核通过，生成生产工单',
        `订单${order.orderNo}审核通过，已自动生成生产工单${wo.workNo}（产品${wo.productName}，数量${wo.produceNum}）。`,
        'prod工单',
        wo.id,
      );
      created.push(wo);
    }
    return created;
  }

  /** 新增/编辑工单 */
  async save(entId: number, user: AuthUser, dto: any) {
    const id = parseIntId(dto.id, '工单ID', true);
    if (id) {
      const wo = await this.woRepo.findOne({ where: { id, enterpriseId: entId } });
      if (!wo) throw new BadRequestException('工单不存在');
      Object.assign(wo, {
        productId: dto.product_id ?? dto.productId ?? wo.productId,
        produceNum: dto.produce_num ?? dto.produceNum ?? wo.produceNum,
        planFinishTime: dto.plan_finish_time ?? dto.planFinishTime ?? wo.planFinishTime,
        remark: dto.remark ?? wo.remark,
        ownerUserId: dto.owner_user_id ?? dto.ownerUserId ?? wo.ownerUserId,
      });
      return this.woRepo.save(wo);
    }
    const product = await this.productRepo.findOne({
      where: { id: dto.product_id ?? dto.productId, enterpriseId: entId },
    });
    const wo = this.woRepo.create({
      enterpriseId: entId,
      orderId: dto.order_id ?? dto.orderId ?? 0,
      workNo: bizNo('WO'),
      productId: dto.product_id ?? dto.productId,
      productName: product?.productName,
      produceNum: dto.produce_num ?? dto.produceNum ?? 0,
      finishNum: 0,
      status: '待排产',
      planFinishTime: dto.plan_finish_time ?? dto.planFinishTime ?? null,
      ownerUserId: dto.owner_user_id ?? dto.ownerUserId ?? user.userId,
      remark: dto.remark,
    });
    return toSnake(await this.woRepo.save(wo));
  }

  /** 工单分页 */
  async page(entId: number, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.woRepo.createQueryBuilder('w').where('w.enterpriseId = :entId', { entId });
    if (query.order_id) qb.andWhere('w.orderId = :oid', { oid: Number(query.order_id) });
    if (query.status) qb.andWhere('w.status = :s', { s: query.status });
    if (query.product_name) qb.andWhere('w.productName LIKE :p', { p: `%${query.product_name}%` });
    qb.orderBy('w.createdAt', 'DESC');
    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();
    return snakePage(list, total, page, size);
  }

  /** 更新状态 / 完工数量 */
  async updateStatus(entId: number, user: AuthUser, dto: any) {
    const id = parseIntId(dto.workorder_id ?? dto.workOrderId ?? dto.id, '工单ID');
    const wo = await this.woRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!wo) throw new BadRequestException('工单不存在');
    const newStatus = dto.status;
    if (newStatus && newStatus !== wo.status) {
      const allowed = WO_FLOW[wo.status] || [];
      if (!allowed.includes(newStatus)) {
        throw new BadRequestException(`工单状态不可从「${wo.status}」流转到「${newStatus}」`);
      }
      wo.status = newStatus;
    }
    if (dto.finish_num !== undefined && dto.finish_num !== null && dto.finish_num !== '') {
      const num = Number(dto.finish_num);
      if (!Number.isInteger(num) || num < 0) throw new BadRequestException('完工数量必须为非负整数');
      if (num > wo.produceNum) throw new BadRequestException('完工数量不能超过生产数量');
      wo.finishNum = num;
      if (num >= wo.produceNum && wo.status !== '已取消') wo.status = '全部完工';
    }
    if (wo.status === '全部完工' && !wo.actualFinishTime) wo.actualFinishTime = new Date();
    return toSnake(await this.woRepo.save(wo));
  }

  /** 工单完工一键入库：回写库存 + 出入库流水 */
  async stockIn(entId: number, user: AuthUser, dto: any) {
    const id = parseIntId(dto.workorder_id ?? dto.workOrderId ?? dto.id, '工单ID');
    const wo = await this.woRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!wo) throw new BadRequestException('工单不存在');
    const product = await this.productRepo.findOne({ where: { id: wo.productId, enterpriseId: entId } });
    if (!product) throw new BadRequestException('关联产品不存在');

    const before = product.stockNum;
    const add = wo.finishNum || wo.produceNum;
    product.stockNum = before + add;
    await this.productRepo.save(product);

    const rec = this.stockRepo.create({
      enterpriseId: entId,
      productId: product.id,
      type: 'in',
      num: add,
      beforeNum: before,
      afterNum: product.stockNum,
      bizType: 'workorder',
      bizId: wo.id,
      remark: `生产工单${wo.workNo}完工入库`,
      operatorId: user.userId,
    });
    await this.stockRepo.save(rec);

    wo.status = '全部完工';
    wo.finishNum = wo.produceNum;
    wo.actualFinishTime = new Date();
    await this.woRepo.save(wo);

    await this.notice.send(
      entId,
      wo.ownerUserId,
      '生产工单已完工入库',
      `工单${wo.workNo}（${wo.productName}）已完工入库，入库数量${add}，库存更新为${product.stockNum}。`,
      'prod工单',
      wo.id,
    );
    return { success: true, product_id: Number(product.id), stock_num: product.stockNum, add };
  }

  /** AI 工单提示：工期预估 + 缺料提醒 */
  async aiTip(entId: number, dto: any) {
    const id = parseIntId(dto.workorder_id ?? dto.workOrderId ?? dto.id, '工单ID');
    const wo = await this.woRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!wo) throw new BadRequestException('工单不存在');
    const product = await this.productRepo.findOne({ where: { id: wo.productId, enterpriseId: entId } });
    const stockNum = product?.stockNum ?? 0;
    const need = Math.max(wo.produceNum - stockNum, 0);
    const days = Math.ceil(need / DAILY_CAPACITY);
    const computed = `工单${wo.workNo}：产品${wo.productName}，计划生产${wo.produceNum}件，当前库存${stockNum}件，需生产${need}件；按日产能${DAILY_CAPACITY}件估算工期约${days}天。${
      stockNum < wo.produceNum ? '当前库存不足，请尽快排产。' : '当前库存充足，可直接排产。'
    }`;
    const r = await this.llm.complete({
      scene: 'chat',
      enterpriseId: entId,
      prompt: `生成生产工单${wo.workNo}的AI生产提示`,
      payload: { produceNum: wo.produceNum, stockNum, days },
    });
    const tip = r.provider === 'openclaw' ? r.content : computed;
    wo.aiTip = tip;
    await this.woRepo.save(wo);
    return { tip, provider: r.provider };
  }
}
