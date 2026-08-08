import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  CrmCustomer,
  Enterprise,
  ErpOrder,
  ErpStockWarn,
  PartnerConfig,
  PartnerPerformance,
  PartnerRisk,
  SysUser,
} from '../../entities';
import { pageResult } from '../../common/result';
import { parsePage, todayStr } from '../../common/scope';
import { AuthUser } from '../../common/auth';
import { LlmService } from '../../infra/llm/llm.service';
import { Prompts } from '../../infra/llm/prompts';
import { ALL_MENU_CODES } from '../../common/menus';

/**
 * 合伙人管理服务
 * 承载飞扬企源独家「分权 / 分利 / 分风险」三分体系
 *
 * V1.0 边界（文档明确）：
 *   分权   —— 完整实现
 *   分利   —— 只做业绩台账与预估分成，自动实发分红核算放到 V2.0
 *   分风险 —— 生成风险预警记录并推送给合伙人
 */
@Injectable()
export class PartnerService {
  private readonly logger = new Logger('PartnerService');
  private readonly overdueDays: number;

  constructor(
    @InjectRepository(PartnerConfig) private readonly cfgRepo: Repository<PartnerConfig>,
    @InjectRepository(PartnerPerformance) private readonly perfRepo: Repository<PartnerPerformance>,
    @InjectRepository(PartnerRisk) private readonly riskRepo: Repository<PartnerRisk>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(CrmCustomer) private readonly custRepo: Repository<CrmCustomer>,
    @InjectRepository(ErpOrder) private readonly orderRepo: Repository<ErpOrder>,
    @InjectRepository(ErpStockWarn) private readonly warnRepo: Repository<ErpStockWarn>,
    @InjectRepository(Enterprise) private readonly entRepo: Repository<Enterprise>,
    private readonly llm: LlmService,
    cfg: ConfigService,
  ) {
    this.overdueDays = cfg.get('biz').followOverdueDays;
  }

  // ==================== 分权 ====================

  /** POST /api/v1/partner/config/save 合伙人分权配置保存 */
  async saveConfig(entId: number, dto: any) {
    const userId = Number(dto.user_id ?? dto.userId);
    if (!userId) throw new BadRequestException('请选择合伙人');
    const user = await this.userRepo.findOne({ where: { id: userId, enterpriseId: entId } });
    if (!user) throw new NotFoundException('员工不存在');

    const menuCodes = Array.isArray(dto.menu_codes ?? dto.menuCodes)
      ? (dto.menu_codes ?? dto.menuCodes).join(',')
      : (dto.menu_codes ?? dto.menuCodes ?? '');
    const ratio = Number(dto.default_ratio ?? dto.defaultRatio ?? 0);
    if (ratio < 0 || ratio > 100) throw new BadRequestException('分成比例应在 0-100 之间');

    let cfg = await this.cfgRepo.findOne({ where: { enterpriseId: entId, userId } });
    const data = {
      partnerType: dto.partner_type ?? dto.partnerType ?? '业务合伙人',
      dataScope: Number(dto.data_scope ?? dto.dataScope ?? 1),
      menuCodes,
      defaultRatio: ratio,
      enable: Number(dto.enable ?? 1),
      remark: dto.remark ?? '',
    };
    if (cfg) Object.assign(cfg, data);
    else cfg = this.cfgRepo.create({ enterpriseId: entId, userId, ...data });
    const saved = await this.cfgRepo.save(cfg);

    // 同步把该员工标记为合伙人
    if (data.enable && !user.isPartner) await this.userRepo.update(userId, { isPartner: 1 });
    if (!data.enable && user.isPartner) await this.userRepo.update(userId, { isPartner: 0 });

    return { id: Number(saved.id) };
  }

  /** GET /api/v1/partner/config/get 获取配置 */
  async getConfig(entId: number, userId: number) {
    const cfg = await this.cfgRepo.findOne({ where: { enterpriseId: entId, userId } });
    const user = await this.userRepo.findOne({ where: { id: userId, enterpriseId: entId } });
    if (!cfg) {
      return {
        exists: false,
        user_id: userId,
        real_name: user?.realName || '',
        partner_type: '业务合伙人',
        data_scope: 1,
        menu_codes: [],
        default_ratio: 0,
        enable: 1,
        remark: '',
      };
    }
    return {
      exists: true,
      id: Number(cfg.id),
      user_id: userId,
      real_name: user?.realName || '',
      partner_type: cfg.partnerType,
      data_scope: cfg.dataScope,
      menu_codes: (cfg.menuCodes || '').split(',').filter(Boolean),
      default_ratio: Number(cfg.defaultRatio),
      enable: cfg.enable,
      remark: cfg.remark,
      created_at: cfg.createdAt,
    };
  }

  /** 合伙人分权配置列表 */
  async configPage(entId: number, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const [list, total] = await this.cfgRepo.findAndCount({
      where: { enterpriseId: entId },
      order: { id: 'DESC' },
      skip,
      take,
    });
    const uids = list.map((c) => Number(c.userId));
    const users = uids.length
      ? await this.userRepo.find({ where: { id: In(uids), enterpriseId: entId } })
      : [];
    const uMap = new Map(users.map((u) => [Number(u.id), u]));

    return pageResult(
      list.map((c) => ({
        id: Number(c.id),
        user_id: Number(c.userId),
        real_name: uMap.get(Number(c.userId))?.realName || '',
        phone: uMap.get(Number(c.userId))?.phone || '',
        partner_type: c.partnerType,
        data_scope: c.dataScope,
        data_scope_text: ['', '本人', '本部门', '全企业'][c.dataScope] || '本人',
        menu_codes: (c.menuCodes || '').split(',').filter(Boolean),
        default_ratio: Number(c.defaultRatio),
        enable: c.enable,
        remark: c.remark,
        created_at: c.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  async removeConfig(entId: number, id: number) {
    const cfg = await this.cfgRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!cfg) throw new NotFoundException('配置不存在');
    await this.userRepo.update(cfg.userId, { isPartner: 0 });
    await this.cfgRepo.delete(id);
    return true;
  }

  /** 可选合伙人（已标记 is_partner 的员工） */
  async partnerOptions(entId: number) {
    const list = await this.userRepo.find({
      where: { enterpriseId: entId, status: 1 },
      order: { id: 'ASC' },
    });
    return list.map((u) => ({
      id: Number(u.id),
      real_name: u.realName || u.username,
      is_partner: u.isPartner,
      post: u.post,
    }));
  }

  // ==================== 分利 ====================

  /** POST /api/v1/partner/performance/save 业绩归属台账新增 */
  async savePerformance(entId: number, dto: any) {
    const userId = Number(dto.user_id ?? dto.userId);
    if (!userId) throw new BadRequestException('请选择合伙人');

    const amount = Number(dto.performance_amount ?? dto.performanceAmount ?? 0);
    if (amount <= 0) throw new BadRequestException('业绩金额必须大于0');

    const cfg = await this.cfgRepo.findOne({ where: { enterpriseId: entId, userId } });
    const ratio = Number(dto.ratio ?? cfg?.defaultRatio ?? 0);
    if (ratio < 0 || ratio > 100) throw new BadRequestException('分成比例应在 0-100 之间');

    const id = Number(dto.id || 0);
    const data = {
      userId,
      orderId: Number(dto.order_id ?? dto.orderId ?? 0),
      orderNo: dto.order_no ?? dto.orderNo ?? '',
      performanceAmount: amount,
      ratio,
      // V1.0 只算预估，不产生任何实发分红动作
      estimateAmount: Number(((amount * ratio) / 100).toFixed(2)),
      period: dto.period ?? todayStr().slice(0, 7),
      remark: dto.remark ?? '',
    };

    if (id) {
      const row = await this.perfRepo.findOne({ where: { id, enterpriseId: entId } });
      if (!row) throw new NotFoundException('台账记录不存在');
      Object.assign(row, data);
      await this.perfRepo.save(row);
      return { id, estimate_amount: data.estimateAmount };
    }
    const saved = await this.perfRepo.save(this.perfRepo.create({ enterpriseId: entId, ...data }));
    return { id: Number(saved.id), estimate_amount: data.estimateAmount };
  }

  /** GET /api/v1/partner/performance/page 业绩台账分页 */
  async performancePage(entId: number, user: AuthUser, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.perfRepo
      .createQueryBuilder('p')
      .where('p.enterpriseId = :entId', { entId })
      .orderBy('p.id', 'DESC')
      .skip(skip)
      .take(take);

    if (query.period) qb.andWhere('p.period = :period', { period: query.period });
    if (query.user_id) qb.andWhere('p.userId = :uid', { uid: Number(query.user_id) });
    // 合伙人本人只能看自己的台账
    if (!user.isSuper && user.dataScope < 3 && user.isPartner) {
      qb.andWhere('p.userId = :self', { self: user.userId });
    }

    const [list, total] = await qb.getManyAndCount();
    const uids = [...new Set(list.map((p) => Number(p.userId)))];
    const users = uids.length
      ? await this.userRepo.find({ where: { id: In(uids), enterpriseId: entId } })
      : [];
    const uMap = new Map(users.map((u) => [Number(u.id), u.realName || u.username]));

    // 汇总
    const sumRow = await this.perfRepo
      .createQueryBuilder('p')
      .select('SUM(p.performanceAmount)', 'amount')
      .addSelect('SUM(p.estimateAmount)', 'estimate')
      .where('p.enterpriseId = :entId', { entId })
      .getRawOne();

    const res = pageResult(
      list.map((p) => ({
        id: Number(p.id),
        user_id: Number(p.userId),
        real_name: uMap.get(Number(p.userId)) || '',
        order_id: Number(p.orderId || 0),
        order_no: p.orderNo,
        performance_amount: Number(p.performanceAmount),
        ratio: Number(p.ratio),
        estimate_amount: Number(p.estimateAmount),
        period: p.period,
        remark: p.remark,
        created_at: p.createdAt,
      })),
      total,
      page,
      size,
    );
    return {
      ...res,
      summary: {
        total_performance: Number(sumRow?.amount || 0),
        total_estimate: Number(sumRow?.estimate || 0),
        note: 'V1.0 仅为预估分成台账，实际发放金额以 V2.0 自动分红核算为准',
      },
    };
  }

  async removePerformance(entId: number, id: number) {
    const row = await this.perfRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!row) throw new NotFoundException('台账记录不存在');
    await this.perfRepo.delete(id);
    return true;
  }

  // ==================== 分风险 ====================

  /** GET /api/v1/partner/risk/page 风险预警记录 */
  async riskPage(entId: number, user: AuthUser, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.riskRepo
      .createQueryBuilder('r')
      .where('r.enterpriseId = :entId', { entId })
      .orderBy('r.id', 'DESC')
      .skip(skip)
      .take(take);
    if (query.risk_type) qb.andWhere('r.riskType = :rt', { rt: query.risk_type });
    if (query.handled !== undefined && query.handled !== '') {
      qb.andWhere('r.handled = :h', { h: Number(query.handled) });
    }
    if (!user.isSuper && user.dataScope < 3) {
      qb.andWhere('r.userId = :self', { self: user.userId });
    }

    const [list, total] = await qb.getManyAndCount();
    const uids = [...new Set(list.map((r) => Number(r.userId)))];
    const users = uids.length
      ? await this.userRepo.find({ where: { id: In(uids), enterpriseId: entId } })
      : [];
    const uMap = new Map(users.map((u) => [Number(u.id), u.realName || u.username]));
    const typeText: Record<string, string> = {
      follow_overdue: '客户逾期未跟进',
      order_abnormal: '订单异常',
      stock_warn: '库存缺货',
    };

    return pageResult(
      list.map((r) => ({
        id: Number(r.id),
        user_id: Number(r.userId),
        real_name: uMap.get(Number(r.userId)) || '',
        risk_type: r.riskType,
        risk_type_text: typeText[r.riskType] || r.riskType,
        biz_id: Number(r.bizId || 0),
        risk_level: r.riskLevel,
        content: r.content,
        ai_advice: r.aiAdvice,
        handled: r.handled,
        created_at: r.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  async handleRisk(entId: number, id: number) {
    const r = await this.riskRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!r) throw new NotFoundException('风险记录不存在');
    r.handled = 1;
    await this.riskRepo.save(r);
    return true;
  }

  /**
   * 风险扫描：客户逾期未跟进 / 订单异常 / 库存缺货
   * 可手动触发，也由定时任务每日执行
   */
  async scanRisk(entId: number) {
    let created = 0;

    const partners = await this.userRepo.find({
      where: { enterpriseId: entId, isPartner: 1, status: 1 },
    });
    // 没有合伙人时，风险推给企业管理员，保证预警不丢
    const receivers = partners.length
      ? partners
      : await this.userRepo.find({ where: { enterpriseId: entId, status: 1 }, take: 1 });
    if (!receivers.length) return { created: 0 };

    const push = async (
      userId: number,
      riskType: string,
      bizId: number,
      level: string,
      content: string,
    ) => {
      const exist = await this.riskRepo.findOne({
        where: { enterpriseId: entId, userId, riskType, bizId, handled: 0 },
      });
      if (exist) return;
      let advice = '';
      try {
        const res = await this.llm.complete({
          scene: 'risk_advice',
          enterpriseId: entId,
          prompt: Prompts.riskAdvice(content),
          payload: { riskType, content, level },
        });
        advice = res.content;
      } catch {
        advice = '';
      }
      await this.riskRepo.save(
        this.riskRepo.create({
          enterpriseId: entId,
          userId,
          riskType,
          bizId,
          riskLevel: level,
          content,
          aiAdvice: advice,
          handled: 0,
        }),
      );
      created++;
    };

    // 1) 客户逾期未跟进
    const deadline = new Date(Date.now() - this.overdueDays * 86400000);
    const custs = await this.custRepo.find({ where: { enterpriseId: entId, isPublic: 0 } });
    for (const c of custs) {
      const ownerId = Number(c.ownerUserId || 0);
      if (!receivers.some((r) => Number(r.id) === ownerId)) continue;
      const last = c.lastFollowTime || c.createdAt;
      const overdueByNext = c.nextFollowTime && new Date(c.nextFollowTime).getTime() < Date.now();
      const overdueByIdle = new Date(last).getTime() < deadline.getTime();
      if (!overdueByNext && !overdueByIdle) continue;
      const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
      await push(
        ownerId,
        'follow_overdue',
        Number(c.id),
        c.grade === 'A' ? '高' : days > 15 ? '高' : '中',
        `客户「${c.customerName}${c.companyName ? '/' + c.companyName : ''}」已 ${days} 天未跟进，客户等级 ${c.grade}，意向分 ${c.intentionScore}`,
      );
    }

    // 2) 订单异常：AI 标记异常且仍未完成
    const orders = await this.orderRepo.find({ where: { enterpriseId: entId } });
    for (const o of orders) {
      if (!o.aiWarnMsg) continue;
      if (['已完成', '已取消'].includes(o.orderStatus)) continue;
      const ownerId = Number(o.ownerUserId || 0);
      if (!receivers.some((r) => Number(r.id) === ownerId)) continue;
      await push(
        ownerId,
        'order_abnormal',
        Number(o.id),
        '高',
        `订单 ${o.orderNo}（客户 ${o.customerName}，金额 ${Number(o.totalAmount)} 元，状态 ${o.orderStatus}）存在异常：${o.aiWarnMsg}`,
      );
    }

    // 3) 库存缺货：统一推给第一个接收人（通常是负责供应链的合伙人/管理员）
    const warns = await this.warnRepo.find({ where: { enterpriseId: entId, handled: 0 } });
    for (const w of warns) {
      await push(
        Number(receivers[0].id),
        'stock_warn',
        Number(w.id),
        '中',
        `产品「${w.productName}」库存 ${w.stockNum} 已低于预警线 ${w.warnStock}`,
      );
    }

    return { created };
  }

  /** 每天早上 8 点自动扫描全部企业的经营风险 */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async cronScan() {
    try {
      const ents = await this.entRepo.find({ where: { status: 1 } });
      let total = 0;
      for (const e of ents) {
        const r = await this.scanRisk(Number(e.id));
        total += r.created;
      }
      this.logger.log(`每日风险扫描完成，新增预警 ${total} 条，覆盖企业 ${ents.length} 家`);
    } catch (e: any) {
      this.logger.error(`每日风险扫描失败：${e.message}`);
    }
  }

  /** 合伙人概览 */
  async overview(entId: number, user: AuthUser) {
    const partnerCnt = await this.cfgRepo.count({ where: { enterpriseId: entId, enable: 1 } });
    const perfSum = await this.perfRepo
      .createQueryBuilder('p')
      .select('SUM(p.performanceAmount)', 'amount')
      .addSelect('SUM(p.estimateAmount)', 'estimate')
      .addSelect('COUNT(1)', 'cnt')
      .where('p.enterpriseId = :entId', { entId })
      .getRawOne();
    const riskCnt = await this.riskRepo.count({ where: { enterpriseId: entId, handled: 0 } });

    return {
      partner_total: partnerCnt,
      performance_count: Number(perfSum?.cnt || 0),
      performance_amount: Number(perfSum?.amount || 0),
      estimate_amount: Number(perfSum?.estimate || 0),
      risk_pending: riskCnt,
      all_menu_codes: ALL_MENU_CODES,
    };
  }
}
