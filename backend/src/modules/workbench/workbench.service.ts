import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Not, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  CrmCustomer,
  CrmDailyReport,
  CrmFollow,
  ErpOrder,
  ErpProduct,
  ErpStockWarn,
  KbDocument,
  PartnerRisk,
  SysConfig,
  SysUser,
} from '../../entities';
import { AuthUser } from '../../common/auth';
import { DataScope, dayRange, todayStr } from '../../common/scope';
import { LlmService } from '../../infra/llm/llm.service';
import { Prompts } from '../../infra/llm/prompts';
import { OrgService } from '../org/org.service';

/**
 * AI 工作台（首页）服务
 * 对应 PRD 模块 1：待办事项 + AI 经营简报 + 快捷入口
 *
 * 所有统计口径都受数据权限约束：
 *   本人   -> 只看自己的客户与订单
 *   本部门 -> 看本部门（含子部门）
 *   全企业 -> 看全部
 */
@Injectable()
export class WorkbenchService {
  private readonly overdueDays: number;

  constructor(
    @InjectRepository(CrmCustomer) private readonly custRepo: Repository<CrmCustomer>,
    @InjectRepository(CrmFollow) private readonly followRepo: Repository<CrmFollow>,
    @InjectRepository(CrmDailyReport) private readonly reportRepo: Repository<CrmDailyReport>,
    @InjectRepository(ErpOrder) private readonly orderRepo: Repository<ErpOrder>,
    @InjectRepository(ErpProduct) private readonly prodRepo: Repository<ErpProduct>,
    @InjectRepository(ErpStockWarn) private readonly warnRepo: Repository<ErpStockWarn>,
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(PartnerRisk) private readonly riskRepo: Repository<PartnerRisk>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(SysConfig) private readonly cfgRepo: Repository<SysConfig>,
    private readonly org: OrgService,
    private readonly llm: LlmService,
    cfg: ConfigService,
  ) {
    this.overdueDays = cfg.get('biz').followOverdueDays;
  }

  /** 当前用户可见的归属人ID集合，null 表示不限制 */
  private async scopeUserIds(entId: number, user: AuthUser): Promise<number[] | null> {
    if (user.isSuper || user.dataScope >= DataScope.ALL) return null;
    if (user.dataScope === DataScope.DEPT) {
      const ids = await this.org.deptUserIds(entId, user.deptId);
      return ids.length ? ids : [user.userId];
    }
    return [user.userId];
  }

  // ==================== 待办事项 ====================

  /**
   * GET /api/v1/workbench/todo
   * 三类待办：待跟进客户、库存预警、订单异常
   */
  async todo(entId: number, user: AuthUser) {
    const ids = await this.scopeUserIds(entId, user);
    const deadline = new Date(Date.now() - this.overdueDays * 86400000);
    const now = Date.now();

    // 1) 待跟进客户
    const custQb = this.custRepo
      .createQueryBuilder('c')
      .where('c.enterpriseId = :entId', { entId })
      .andWhere('c.isPublic = 0');
    if (ids) custQb.andWhere('c.ownerUserId IN (:...ids)', { ids });
    const custs = await custQb.getMany();

    const followTodo = custs
      .map((c) => {
        const last = c.lastFollowTime || c.createdAt;
        const lastMs = new Date(last).getTime();
        const overdueByNext = c.nextFollowTime && new Date(c.nextFollowTime).getTime() < now;
        const overdueByIdle = lastMs < deadline.getTime();
        if (!overdueByNext && !overdueByIdle) return null;
        const days = Math.floor((now - lastMs) / 86400000);
        return {
          id: Number(c.id),
          customer_name: c.customerName,
          company_name: c.companyName,
          phone: c.phone,
          grade: c.grade,
          intention_score: c.intentionScore,
          idle_days: days,
          next_follow_time: c.nextFollowTime,
          reason: overdueByNext ? '已过约定跟进时间' : `已 ${days} 天未跟进`,
          // A 级客户放弃成本最高，排最前
          weight: (c.grade === 'A' ? 1000 : c.grade === 'B' ? 500 : 0) + days,
        };
      })
      .filter(Boolean) as any[];
    followTodo.sort((a, b) => b.weight - a.weight);

    // 2) 库存预警
    const warns = await this.warnRepo.find({
      where: { enterpriseId: entId, handled: 0 },
      order: { id: 'DESC' },
      take: 20,
    });

    // 3) 订单异常：AI 标记异常 + 长期停滞
    const orderQb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.enterpriseId = :entId', { entId })
      .andWhere('o.orderStatus NOT IN (:...done)', { done: ['已完成', '已取消'] });
    if (ids) orderQb.andWhere('o.ownerUserId IN (:...ids)', { ids });
    const openOrders = await orderQb.getMany();

    const orderTodo = openOrders
      .map((o) => {
        const stalledDays = Math.floor((now - new Date(o.updatedAt || o.createdAt).getTime()) / 86400000);
        const overdueDelivery =
          o.deliveryDate && new Date(o.deliveryDate + 'T23:59:59').getTime() < now;
        if (!o.aiWarnMsg && stalledDays < 7 && !overdueDelivery) return null;
        const reasons: string[] = [];
        if (overdueDelivery) reasons.push('交期已过期');
        if (stalledDays >= 7) reasons.push(`状态已停滞 ${stalledDays} 天`);
        if (o.aiWarnMsg) reasons.push(o.aiWarnMsg);
        return {
          id: Number(o.id),
          order_no: o.orderNo,
          customer_name: o.customerName,
          total_amount: Number(o.totalAmount),
          order_status: o.orderStatus,
          delivery_date: o.deliveryDate,
          reason: reasons.join('；'),
          level: overdueDelivery ? '高' : '中',
        };
      })
      .filter(Boolean) as any[];

    // 4) 合伙人风险（有则一并提示）
    const riskWhere: any = { enterpriseId: entId, handled: 0 };
    if (ids) riskWhere.userId = In(ids);
    const risks = await this.riskRepo.find({ where: riskWhere, order: { id: 'DESC' }, take: 10 });

    // 5) 今日日报是否已填
    const todayReport = await this.reportRepo.findOne({
      where: { enterpriseId: entId, userId: user.userId, reportDate: todayStr() },
    });

    return {
      follow_customers: {
        total: followTodo.length,
        list: followTodo.slice(0, 10).map(({ weight, ...rest }) => rest),
      },
      stock_warns: {
        total: warns.length,
        list: warns.map((w) => ({
          id: Number(w.id),
          product_id: Number(w.productId),
          product_name: w.productName,
          stock_num: w.stockNum,
          warn_stock: w.warnStock,
          ai_advice: w.aiAdvice,
        })),
      },
      abnormal_orders: { total: orderTodo.length, list: orderTodo.slice(0, 10) },
      partner_risks: {
        total: risks.length,
        list: risks.map((r) => ({
          id: Number(r.id),
          risk_type: r.riskType,
          risk_level: r.riskLevel,
          content: r.content,
          ai_advice: r.aiAdvice,
        })),
      },
      daily_report_done: !!todayReport,
      todo_total:
        followTodo.length + warns.length + orderTodo.length + risks.length + (todayReport ? 0 : 1),
    };
  }

  // ==================== 数据卡片 ====================

  /** GET /api/v1/workbench/overview 首页统计卡片 */
  async overview(entId: number, user: AuthUser) {
    const ids = await this.scopeUserIds(entId, user);
    const { start, end } = dayRange();

    const custWhere: any = { enterpriseId: entId };
    if (ids) custWhere.ownerUserId = In(ids);

    const customerTotal = await this.custRepo.count({ where: custWhere });
    const customerToday = await this.custRepo.count({
      where: { ...custWhere, createdAt: Between(start, end) },
    });
    const publicTotal = await this.custRepo.count({ where: { enterpriseId: entId, isPublic: 1 } });

    const followWhere: any = { enterpriseId: entId, createdAt: Between(start, end) };
    if (ids) followWhere.userId = In(ids);
    const followToday = await this.followRepo.count({ where: followWhere });

    const orderWhere: any = { enterpriseId: entId };
    if (ids) orderWhere.ownerUserId = In(ids);
    const orderToday = await this.orderRepo.find({
      where: { ...orderWhere, createdAt: Between(start, end) },
    });
    const amountToday = orderToday.reduce((s, o) => s + Number(o.totalAmount || 0), 0);

    const orderProcessing = await this.orderRepo.count({
      where: { ...orderWhere, orderStatus: In(['待审核', '生产中', '已发货']) },
    });

    const docTotal = await this.docRepo.count({ where: { enterpriseId: entId } });
    const productTotal = await this.prodRepo.count({ where: { enterpriseId: entId, status: 1 } });
    const warnTotal = await this.warnRepo.count({ where: { enterpriseId: entId, handled: 0 } });
    const userTotal = await this.userRepo.count({ where: { enterpriseId: entId, status: 1 } });

    return {
      customer_total: customerTotal,
      customer_today: customerToday,
      public_pool_total: publicTotal,
      follow_today: followToday,
      order_today: orderToday.length,
      amount_today: Number(amountToday.toFixed(2)),
      order_processing: orderProcessing,
      doc_total: docTotal,
      product_total: productTotal,
      stock_warn_total: warnTotal,
      user_total: userTotal,
      data_scope: user.dataScope,
      data_scope_text: ['', '本人', '本部门', '全企业'][user.dataScope] || '本人',
    };
  }

  // ==================== AI 经营简报 ====================

  /**
   * GET /api/v1/workbench/ai_briefing
   * AI 自动提炼今日销售、订单、库存简要文字报告
   */
  async aiBriefing(entId: number, user: AuthUser) {
    const ov = await this.overview(entId, user);
    const todo = await this.todo(entId, user);

    const data = {
      orderCnt: ov.order_today,
      amount: ov.amount_today,
      newCustomer: ov.customer_today,
      stockWarnCnt: ov.stock_warn_total,
      abnormalOrderCnt: todo.abnormal_orders.total,
    };

    const ctx = [
      `统计日期：${todayStr()}`,
      `新增客户：${ov.customer_today} 个（客户总量 ${ov.customer_total}）`,
      `今日跟进：${ov.follow_today} 次`,
      `新增订单：${ov.order_today} 笔，金额 ${ov.amount_today} 元`,
      `在途订单：${ov.order_processing} 笔，其中异常 ${todo.abnormal_orders.total} 笔`,
      `库存预警：${ov.stock_warn_total} 个产品低于预警线`,
      `待跟进客户：${todo.follow_customers.total} 个`,
    ].join('\n');

    const res = await this.llm.complete({
      scene: 'biz_daily',
      enterpriseId: entId,
      prompt: Prompts.bizDaily(ctx),
      payload: { data },
    });

    return {
      date: todayStr(),
      content: res.content,
      provider: res.provider,
      fallback_reason: res.fallbackReason || '',
      raw_data: data,
    };
  }

  // ==================== 快捷入口与公告 ====================

  /** GET /api/v1/workbench/shortcuts 快捷入口（按菜单权限过滤） */
  async shortcuts(entId: number, user: AuthUser) {
    const all = [
      { code: 'crm:customer', name: '新增客户', path: '/crm/customer?action=add', icon: 'user-add' },
      { code: 'kb:doc', name: '上传文档', path: '/kb/doc?action=upload', icon: 'upload' },
      { code: 'crm:report', name: '写日报', path: '/crm/report', icon: 'edit' },
      { code: 'erp:order', name: '开订单', path: '/erp/order?action=add', icon: 'file-add' },
      { code: 'erp:stock', name: '库存出入库', path: '/erp/stock', icon: 'inbox' },
      { code: 'kb:qa', name: '知识库问答', path: '/kb/qa', icon: 'question' },
    ];
    const menus = user.menuCodes || [];
    const list = user.isSuper ? all : all.filter((s) => menus.includes(s.code));

    const notice = await this.cfgRepo.findOne({
      where: { enterpriseId: entId, configKey: 'workbench_notice' },
    });

    return {
      list: list.length ? list : all.slice(0, 3),
      notice: notice?.configValue || '',
      llm_ready: await this.llm.isLlmReady(entId),
    };
  }

  /** GET /api/v1/workbench/trend 近 7 日客户与订单趋势 */
  async trend(entId: number, user: AuthUser) {
    const ids = await this.scopeUserIds(entId, user);
    const days: Array<{ date: string; customer: number; order: number; amount: number }> = [];

    for (let i = 6; i >= 0; i--) {
      const base = new Date(Date.now() - i * 86400000);
      const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0);
      const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59);

      const custWhere: any = { enterpriseId: entId, createdAt: Between(start, end) };
      if (ids) custWhere.ownerUserId = In(ids);
      const customer = await this.custRepo.count({ where: custWhere });

      const orderWhere: any = { enterpriseId: entId, createdAt: Between(start, end) };
      if (ids) orderWhere.ownerUserId = In(ids);
      const orders = await this.orderRepo.find({ where: orderWhere });
      const amount = orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);

      const p = (n: number) => String(n).padStart(2, '0');
      days.push({
        date: `${base.getMonth() + 1}-${p(base.getDate())}`,
        customer,
        order: orders.length,
        amount: Number(amount.toFixed(2)),
      });
    }
    return { trend: days };
  }

  /** GET /api/v1/workbench/index 首页一次性聚合，减少前端请求数 */
  async index(entId: number, user: AuthUser) {
    const [overview, todo, shortcuts, trend, briefing] = await Promise.all([
      this.overview(entId, user),
      this.todo(entId, user),
      this.shortcuts(entId, user),
      this.trend(entId, user),
      // 简报生成可能走外部大模型，单点失败不能拖垮整个首页
      this.aiBriefing(entId, user).catch(() => ({
        date: todayStr(),
        content: '',
        provider: '',
        fallback_reason: '简报生成失败，请点击「重新生成」重试',
        raw_data: {},
      })),
    ]);
    return { overview, todo, shortcuts, briefing, ...trend };
  }
}
