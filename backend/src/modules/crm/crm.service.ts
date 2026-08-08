import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CrmCustomer, CrmDailyReport, CrmFollow, SysUser } from '../../entities';
import { pageResult } from '../../common/result';
import { applyScope, canOperate, dayRange, parsePage, todayStr } from '../../common/scope';
import { AuthUser } from '../../common/auth';
import { AiService } from '../ai/ai.service';
import { OrgService } from '../org/org.service';
import { LlmService } from '../../infra/llm/llm.service';
import { Prompts } from '../../infra/llm/prompts';

@Injectable()
export class CrmService {
  /** 客户列表固定每页条数，来源于产品规则「客户列表每 10 条一页」 */
  private readonly pageSize: number;
  /** 跟进逾期天数阈值 */
  private readonly overdueDays: number;

  constructor(
    @InjectRepository(CrmCustomer) private readonly custRepo: Repository<CrmCustomer>,
    @InjectRepository(CrmFollow) private readonly followRepo: Repository<CrmFollow>,
    @InjectRepository(CrmDailyReport) private readonly reportRepo: Repository<CrmDailyReport>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    private readonly ai: AiService,
    private readonly org: OrgService,
    private readonly llm: LlmService,
    cfg: ConfigService,
  ) {
    this.pageSize = cfg.get('biz').crmPageSize;
    this.overdueDays = cfg.get('biz').followOverdueDays;
  }

  private async scopeUserIds(entId: number, user: AuthUser): Promise<number[]> {
    if (user.isSuper || user.dataScope >= 3) return [];
    if (user.dataScope === 2) return this.org.deptUserIds(entId, user.deptId);
    return [user.userId];
  }

  // ==================== 客户 ====================

  /**
   * POST /api/v1/crm/customer/save 新增 / 编辑客户
   *
   * 产品硬规则：contact_time 一律取服务器实时时间，忽略前端传值。
   */
  async saveCustomer(entId: number, user: AuthUser, dto: any) {
    const customerName = (dto.customer_name ?? dto.customerName ?? '').trim();
    if (!customerName) throw new BadRequestException('客户姓名不能为空');

    const id = Number(dto.id || 0);
    const now = new Date();

    if (id) {
      const cust = await this.custRepo.findOne({ where: { id, enterpriseId: entId } });
      if (!cust) throw new NotFoundException('客户不存在');
      const scopeIds = await this.scopeUserIds(entId, user);
      if (!canOperate(user, Number(cust.ownerUserId), scopeIds)) {
        throw new ForbiddenException('您无权修改该客户');
      }
      Object.assign(cust, {
        companyName: dto.company_name ?? dto.companyName ?? cust.companyName,
        customerName,
        phone: dto.phone ?? cust.phone,
        remark: dto.remark ?? cust.remark,
        tags: Array.isArray(dto.tags) ? dto.tags.join(',') : (dto.tags ?? cust.tags),
        // 每次编辑视为一次联系，刷新联系时间为服务器当前时间
        contactTime: now,
      });
      if (dto.owner_user_id ?? dto.ownerUserId) {
        cust.ownerUserId = Number(dto.owner_user_id ?? dto.ownerUserId);
        const owner = await this.userRepo.findOne({ where: { id: cust.ownerUserId, enterpriseId: entId } });
        cust.deptId = Number(owner?.deptId || 0);
      }
      await this.custRepo.save(cust);
      await this.scoreCustomer(entId, Number(cust.id));
      return { id: Number(cust.id) };
    }

    const ownerId = Number(dto.owner_user_id ?? dto.ownerUserId ?? user.userId);
    const owner = await this.userRepo.findOne({ where: { id: ownerId, enterpriseId: entId } });
    if (!owner) throw new BadRequestException('归属销售不存在');

    const saved = await this.custRepo.save(
      this.custRepo.create({
        enterpriseId: entId,
        companyName: dto.company_name ?? dto.companyName ?? '',
        customerName,
        phone: dto.phone ?? '',
        contactTime: now,
        remark: dto.remark ?? '',
        tags: Array.isArray(dto.tags) ? dto.tags.join(',') : (dto.tags ?? ''),
        grade: 'C',
        intentionScore: 0,
        ownerUserId: ownerId,
        deptId: Number(owner.deptId || 0),
        isPublic: 0,
      }),
    );

    const score = await this.scoreCustomer(entId, Number(saved.id));
    return { id: Number(saved.id), intention_score: score.score, grade: score.grade };
  }

  /** AI 意向打分，写回客户档案 */
  async scoreCustomer(entId: number, customerId: number) {
    const cust = await this.custRepo.findOne({ where: { id: customerId, enterpriseId: entId } });
    if (!cust) return { score: 0, grade: 'C', reason: '' };

    const follows = await this.followRepo.find({
      where: { enterpriseId: entId, customerId },
      order: { id: 'DESC' },
      take: 10,
    });
    const ctx = [
      `公司名称：${cust.companyName || '未填写'}`,
      `客户姓名：${cust.customerName}`,
      `联系电话：${cust.phone || '未填写'}`,
      `客户标签：${cust.tags || '无'}`,
      `备注：${cust.remark || '无'}`,
      `跟进次数：${follows.length}`,
      `最近跟进：\n${follows.map((f) => `- [${f.followType}] ${f.content}`).join('\n') || '暂无跟进记录'}`,
    ].join('\n');

    // 结构化特征：跟进频次与最近联系间隔，是意向度判断的硬指标
    const lastTime = cust.lastFollowTime || (follows[0] ? follows[0].createdAt : null);
    const daysSinceLast = lastTime
      ? Math.max(0, Math.floor((Date.now() - new Date(lastTime).getTime()) / 86400000))
      : 999;

    const res = await this.ai.classify({
      enterpriseId: entId,
      bizType: 'customer_intention',
      context: ctx,
      features: {
        followCount: follows.length,
        daysSinceLastFollow: daysSinceLast,
        text: [cust.remark || '', cust.tags || '', ...follows.map((f) => f.content || '')].join(' '),
      },
    });
    const score = Number((res as any).score || 0);
    const grade = String((res as any).grade || 'C');
    await this.custRepo.update(customerId, {
      intentionScore: score,
      grade,
      aiAnalysis: (res as any).reason || '',
    });
    return { score, grade, reason: (res as any).reason || '' };
  }

  /** GET /api/v1/crm/customer/page 客户分页，每页固定 10 条 */
  async customerPage(entId: number, user: AuthUser, query: any) {
    const page = Math.max(1, Number(query.page ?? query.pageNum ?? 1) || 1);
    const size = this.pageSize; // 产品规则固定 10 条
    const qb = this.custRepo
      .createQueryBuilder('c')
      .where('c.enterpriseId = :entId', { entId })
      .andWhere('c.isPublic = :pub', { pub: Number(query.is_public ?? query.isPublic ?? 0) })
      .orderBy('c.id', 'DESC')
      .skip((page - 1) * size)
      .take(size);

    if (query.keyword) {
      qb.andWhere('(c.customerName LIKE :kw OR c.companyName LIKE :kw OR c.phone LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    if (query.grade) qb.andWhere('c.grade = :grade', { grade: query.grade });
    if (query.owner_user_id ?? query.ownerUserId) {
      qb.andWhere('c.ownerUserId = :oid', { oid: Number(query.owner_user_id ?? query.ownerUserId) });
    }
    if (query.tag) qb.andWhere('c.tags LIKE :tag', { tag: `%${query.tag}%` });

    // 公海对全员可见；私有客户走数据权限
    if (Number(query.is_public ?? 0) === 0) {
      applyScope(qb, user, 'c', 'ownerUserId', await this.scopeUserIds(entId, user));
    }

    const [list, total] = await qb.getManyAndCount();
    return pageResult(await this.decorate(entId, list), total, page, size);
  }

  private async decorate(entId: number, list: CrmCustomer[]) {
    if (!list.length) return [];
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    const uMap = new Map(users.map((u) => [Number(u.id), u.realName || u.username]));
    const gradeText: Record<string, string> = { A: '高意向', B: '潜在客户', C: '普通', D: '沉睡' };
    const now = Date.now();

    return list.map((c) => ({
      id: Number(c.id),
      company_name: c.companyName,
      customer_name: c.customerName,
      phone: c.phone,
      contact_time: c.contactTime,
      remark: c.remark,
      tags: (c.tags || '').split(',').filter(Boolean),
      grade: c.grade,
      grade_text: gradeText[c.grade] || c.grade,
      intention_score: c.intentionScore,
      ai_analysis: c.aiAnalysis,
      owner_user_id: Number(c.ownerUserId || 0),
      owner_name: uMap.get(Number(c.ownerUserId)) || '',
      is_public: c.isPublic,
      last_follow_time: c.lastFollowTime,
      next_follow_time: c.nextFollowTime,
      // 逾期判定：约定了下次跟进时间但已过期，或从未跟进且超过阈值天数
      overdue: c.nextFollowTime
        ? new Date(c.nextFollowTime).getTime() < now
        : now - new Date(c.lastFollowTime || c.createdAt).getTime() >
          this.overdueDays * 86400000,
      created_at: c.createdAt,
    }));
  }

  async customerDetail(entId: number, user: AuthUser, id: number) {
    const cust = await this.custRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!cust) throw new NotFoundException('客户不存在');
    if (!cust.isPublic) {
      const scopeIds = await this.scopeUserIds(entId, user);
      if (!canOperate(user, Number(cust.ownerUserId), scopeIds)) {
        throw new ForbiddenException('您无权查看该客户');
      }
    }
    const [row] = await this.decorate(entId, [cust]);
    const follows = await this.followList(entId, id);
    return { ...row, follows };
  }

  /** POST /api/v1/crm/customer/public 移入公海 */
  async moveToPublic(entId: number, user: AuthUser, ids: number[]) {
    if (!ids?.length) throw new BadRequestException('请选择客户');
    const list = await this.custRepo.find({ where: { id: In(ids), enterpriseId: entId } });
    const scopeIds = await this.scopeUserIds(entId, user);
    for (const c of list) {
      if (!canOperate(user, Number(c.ownerUserId), scopeIds)) {
        throw new ForbiddenException(`客户「${c.customerName}」不在您的数据权限内`);
      }
    }
    await this.custRepo.update({ id: In(list.map((c) => c.id)) }, { isPublic: 1, ownerUserId: 0 });
    return { moved: list.length };
  }

  /** 公海领取客户 */
  async claim(entId: number, user: AuthUser, ids: number[]) {
    if (!ids?.length) throw new BadRequestException('请选择客户');
    const list = await this.custRepo.find({
      where: { id: In(ids), enterpriseId: entId, isPublic: 1 },
    });
    if (!list.length) throw new BadRequestException('所选客户不在公海中');
    await this.custRepo.update(
      { id: In(list.map((c) => c.id)) },
      { isPublic: 0, ownerUserId: user.userId, deptId: user.deptId, contactTime: new Date() },
    );
    return { claimed: list.length };
  }

  async removeCustomer(entId: number, user: AuthUser, id: number) {
    const cust = await this.custRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!cust) throw new NotFoundException('客户不存在');
    const scopeIds = await this.scopeUserIds(entId, user);
    if (!canOperate(user, Number(cust.ownerUserId), scopeIds)) {
      throw new ForbiddenException('您无权删除该客户');
    }
    await this.followRepo.delete({ enterpriseId: entId, customerId: id });
    await this.custRepo.delete(id);
    return true;
  }

  /** 导出用：返回全量（受数据权限约束）客户行 */
  async exportRows(entId: number, user: AuthUser, query: any) {
    const qb = this.custRepo
      .createQueryBuilder('c')
      .where('c.enterpriseId = :entId', { entId })
      .orderBy('c.id', 'DESC')
      .take(5000);
    if (query.keyword) {
      qb.andWhere('(c.customerName LIKE :kw OR c.companyName LIKE :kw OR c.phone LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    applyScope(qb, user, 'c', 'ownerUserId', await this.scopeUserIds(entId, user));
    return this.decorate(entId, await qb.getMany());
  }

  // ==================== 跟进 ====================

  /** POST /api/v1/crm/follow/save 新增跟进记录，AI 自动给出跟进建议 */
  async saveFollow(entId: number, user: AuthUser, dto: any) {
    const customerId = Number(dto.customer_id ?? dto.customerId);
    const content = (dto.content || '').trim();
    if (!customerId) throw new BadRequestException('请选择客户');
    if (!content) throw new BadRequestException('跟进内容不能为空');

    const cust = await this.custRepo.findOne({ where: { id: customerId, enterpriseId: entId } });
    if (!cust) throw new NotFoundException('客户不存在');

    const now = new Date();
    const nextTime = dto.next_follow_time ?? dto.nextFollowTime;

    // 生成 AI 跟进建议
    const history = await this.followRepo.find({
      where: { enterpriseId: entId, customerId },
      order: { id: 'DESC' },
      take: 5,
    });
    const ctx = [
      `客户：${cust.customerName}（${cust.companyName || '个人'}）`,
      `当前等级：${cust.grade}，意向分：${cust.intentionScore}`,
      `本次跟进方式：${dto.follow_type ?? dto.followType ?? '电话'}`,
      `本次跟进内容：${content}`,
      `历史跟进：\n${history.map((h) => `- ${h.content}`).join('\n') || '首次跟进'}`,
    ].join('\n');

    let aiSuggest = '';
    try {
      const res = await this.llm.complete({
        scene: 'follow_suggest',
        enterpriseId: entId,
        prompt: Prompts.followSuggest(ctx),
        payload: {
          customerName: cust.customerName,
          grade: cust.grade,
          content,
          followType: dto.follow_type ?? dto.followType ?? '电话',
          historyCount: history.length,
        },
      });
      aiSuggest = res.content;
    } catch {
      aiSuggest = '';
    }

    const saved = await this.followRepo.save(
      this.followRepo.create({
        enterpriseId: entId,
        customerId,
        userId: user.userId,
        followType: dto.follow_type ?? dto.followType ?? '电话',
        content,
        nextFollowTime: nextTime ? new Date(nextTime) : null,
        aiSuggest,
      }),
    );

    // 同步刷新客户联系时间与下次跟进时间
    await this.custRepo.update(customerId, {
      contactTime: now,
      lastFollowTime: now,
      nextFollowTime: nextTime ? new Date(nextTime) : cust.nextFollowTime,
    });
    // 跟进后重新评估意向
    const score = await this.scoreCustomer(entId, customerId);

    return {
      id: Number(saved.id),
      ai_suggest: aiSuggest,
      intention_score: score.score,
      grade: score.grade,
    };
  }

  /** GET /api/v1/crm/follow/list 客户跟进列表 */
  async followList(entId: number, customerId: number) {
    const list = await this.followRepo.find({
      where: { enterpriseId: entId, customerId },
      order: { id: 'DESC' },
    });
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    const uMap = new Map(users.map((u) => [Number(u.id), u.realName || u.username]));
    return list.map((f) => ({
      id: Number(f.id),
      customer_id: Number(f.customerId),
      follow_type: f.followType,
      content: f.content,
      next_follow_time: f.nextFollowTime,
      ai_suggest: f.aiSuggest,
      user_id: Number(f.userId),
      user_name: uMap.get(Number(f.userId)) || '',
      created_at: f.createdAt,
    }));
  }

  /** 全部跟进记录分页（跟进记录菜单） */
  async followPage(entId: number, user: AuthUser, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.followRepo
      .createQueryBuilder('f')
      .where('f.enterpriseId = :entId', { entId })
      .orderBy('f.id', 'DESC')
      .skip(skip)
      .take(take);
    if (query.customer_id) qb.andWhere('f.customerId = :cid', { cid: Number(query.customer_id) });
    if (query.follow_type) qb.andWhere('f.followType = :ft', { ft: query.follow_type });
    applyScope(qb, user, 'f', 'userId', await this.scopeUserIds(entId, user));

    const [list, total] = await qb.getManyAndCount();
    const custIds = [...new Set(list.map((f) => Number(f.customerId)))];
    const custs = custIds.length
      ? await this.custRepo.find({ where: { id: In(custIds), enterpriseId: entId } })
      : [];
    const cMap = new Map(custs.map((c) => [Number(c.id), c]));
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    const uMap = new Map(users.map((u) => [Number(u.id), u.realName || u.username]));

    return pageResult(
      list.map((f) => ({
        id: Number(f.id),
        customer_id: Number(f.customerId),
        customer_name: cMap.get(Number(f.customerId))?.customerName || '',
        company_name: cMap.get(Number(f.customerId))?.companyName || '',
        follow_type: f.followType,
        content: f.content,
        next_follow_time: f.nextFollowTime,
        ai_suggest: f.aiSuggest,
        user_name: uMap.get(Number(f.userId)) || '',
        created_at: f.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  /** 待跟进 / 逾期客户，工作台待办用 */
  async overdueCustomers(entId: number, user: AuthUser, limit = 10) {
    const qb = this.custRepo
      .createQueryBuilder('c')
      .where('c.enterpriseId = :entId', { entId })
      .andWhere('c.isPublic = 0')
      .andWhere('(c.nextFollowTime IS NOT NULL AND c.nextFollowTime < :now)', { now: new Date() })
      .orderBy('c.nextFollowTime', 'ASC')
      .take(limit);
    applyScope(qb, user, 'c', 'ownerUserId', await this.scopeUserIds(entId, user));
    return this.decorate(entId, await qb.getMany());
  }

  // ==================== 销售日报 ====================

  /** POST /api/v1/crm/daily/report/save 保存销售日报（同人同日唯一） */
  async saveReport(entId: number, user: AuthUser, dto: any) {
    const reportDate = dto.report_date ?? dto.reportDate ?? todayStr();
    let report = await this.reportRepo.findOne({
      where: { enterpriseId: entId, userId: user.userId, reportDate },
    });
    const data = {
      callCnt: Number(dto.call_cnt ?? dto.callCnt ?? 0),
      wechatAddCnt: Number(dto.wechat_add_cnt ?? dto.wechatAddCnt ?? 0),
      intentionCustCnt: Number(dto.intention_cust_cnt ?? dto.intentionCustCnt ?? 0),
      visitCnt: Number(dto.visit_cnt ?? dto.visitCnt ?? 0),
      experience: dto.experience ?? '',
      tomorrowPlan: dto.tomorrow_plan ?? dto.tomorrowPlan ?? '',
      aiAutoContent: dto.ai_auto_content ?? dto.aiAutoContent ?? '',
    };
    if (report) {
      Object.assign(report, data);
    } else {
      report = this.reportRepo.create({
        enterpriseId: entId,
        userId: user.userId,
        reportDate,
        ...data,
      });
    }
    const saved = await this.reportRepo.save(report);
    return { id: Number(saved.id), report_date: reportDate };
  }

  /** GET /api/v1/crm/daily/report/get 获取个人日报 */
  async getReport(entId: number, user: AuthUser, query: any) {
    const reportDate = query.report_date ?? query.reportDate ?? todayStr();
    const userId = Number(query.user_id ?? query.userId ?? user.userId);
    if (userId !== user.userId && user.dataScope < 2 && !user.isSuper) {
      throw new ForbiddenException('您只能查看本人日报');
    }
    const report = await this.reportRepo.findOne({
      where: { enterpriseId: entId, userId, reportDate },
    });
    const stat = await this.todayStat(entId, userId, reportDate);
    if (!report) {
      return {
        exists: false,
        report_date: reportDate,
        user_id: userId,
        call_cnt: stat.callCnt,
        wechat_add_cnt: stat.wechatCnt,
        intention_cust_cnt: stat.intentionCnt,
        visit_cnt: stat.visitCnt,
        experience: '',
        tomorrow_plan: '',
        ai_auto_content: '',
        auto_stat: stat,
      };
    }
    return {
      exists: true,
      id: Number(report.id),
      report_date: report.reportDate,
      user_id: userId,
      call_cnt: report.callCnt,
      wechat_add_cnt: report.wechatAddCnt,
      intention_cust_cnt: report.intentionCustCnt,
      visit_cnt: report.visitCnt,
      experience: report.experience,
      tomorrow_plan: report.tomorrowPlan,
      ai_auto_content: report.aiAutoContent,
      auto_stat: stat,
      updated_at: report.updatedAt,
    };
  }

  /** 从跟进记录自动统计当日成果 */
  private async todayStat(entId: number, userId: number, dateStr?: string) {
    const { start, end } = dayRange(dateStr);
    const follows = await this.followRepo.find({
      where: { enterpriseId: entId, userId, createdAt: Between(start, end) },
    });
    const callCnt = follows.filter((f) => f.followType === '电话').length;
    const wechatCnt = follows.filter((f) => f.followType === '微信').length;
    const visitCnt = follows.filter((f) => f.followType === '拜访').length;

    const newCusts = await this.custRepo.find({
      where: { enterpriseId: entId, ownerUserId: userId, createdAt: Between(start, end) },
    });
    const intentionCnt = newCusts.filter((c) => ['A', 'B'].includes(c.grade)).length;

    return {
      callCnt,
      wechatCnt,
      visitCnt,
      intentionCnt,
      newCustCnt: newCusts.length,
      followCnt: follows.length,
      followDetails: follows.map((f) => `[${f.followType}] ${f.content}`).slice(0, 20),
      newCustNames: newCusts.map((c) => c.customerName).slice(0, 20),
    };
  }

  /**
   * POST /api/v1/crm/daily/report/ai_generate
   * AI 读取当日跟进、客户数据一键生成完整日报
   */
  async aiGenerateReport(entId: number, user: AuthUser, dto: any) {
    const reportDate = dto.report_date ?? dto.reportDate ?? todayStr();
    const stat = await this.todayStat(entId, user.userId, reportDate);

    const ctx = [
      `日期：${reportDate}`,
      `销售人员：${user.realName}`,
      `电话量：${stat.callCnt}`,
      `微信添加：${stat.wechatCnt}`,
      `约拜访：${stat.visitCnt}`,
      `新增客户：${stat.newCustCnt}，其中意向客户：${stat.intentionCnt}`,
      `新增客户名单：${stat.newCustNames.join('、') || '无'}`,
      `今日跟进明细：\n${stat.followDetails.join('\n') || '暂无跟进记录'}`,
    ].join('\n');

    const res = await this.llm.complete({
      scene: 'daily_report',
      enterpriseId: entId,
      prompt: Prompts.dailyReport(ctx),
      payload: {
        date: reportDate,
        userName: user.realName,
        callCnt: stat.callCnt,
        wechatCnt: stat.wechatCnt,
        visitCnt: stat.visitCnt,
        intentionCnt: stat.intentionCnt,
        newCustCnt: stat.newCustCnt,
        followDetails: stat.followDetails,
        newCustNames: stat.newCustNames,
      },
    });

    return {
      report_date: reportDate,
      call_cnt: stat.callCnt,
      wechat_add_cnt: stat.wechatCnt,
      intention_cust_cnt: stat.intentionCnt,
      visit_cnt: stat.visitCnt,
      ai_auto_content: res.content,
      provider: res.provider,
    };
  }

  /** 日报分页（主管查看团队日报） */
  async reportPage(entId: number, user: AuthUser, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.reportRepo
      .createQueryBuilder('r')
      .where('r.enterpriseId = :entId', { entId })
      .orderBy('r.reportDate', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .skip(skip)
      .take(take);
    if (query.report_date) qb.andWhere('r.reportDate = :d', { d: query.report_date });
    applyScope(qb, user, 'r', 'userId', await this.scopeUserIds(entId, user));

    const [list, total] = await qb.getManyAndCount();
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    const uMap = new Map(users.map((u) => [Number(u.id), u.realName || u.username]));

    return pageResult(
      list.map((r) => ({
        id: Number(r.id),
        report_date: r.reportDate,
        user_id: Number(r.userId),
        user_name: uMap.get(Number(r.userId)) || '',
        call_cnt: r.callCnt,
        wechat_add_cnt: r.wechatAddCnt,
        intention_cust_cnt: r.intentionCustCnt,
        visit_cnt: r.visitCnt,
        experience: r.experience,
        tomorrow_plan: r.tomorrowPlan,
        ai_auto_content: r.aiAutoContent,
        created_at: r.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  // ==================== 销售统计 ====================

  /** GET /api/v1/crm/stat 个人 / 团队销售数据统计 */
  async stat(entId: number, user: AuthUser) {
    const scopeIds = await this.scopeUserIds(entId, user);
    const base = () => {
      const qb = this.custRepo.createQueryBuilder('c').where('c.enterpriseId = :entId', { entId });
      applyScope(qb, user, 'c', 'ownerUserId', scopeIds);
      return qb;
    };

    const total = await base().andWhere('c.isPublic = 0').getCount();
    const publicTotal = await this.custRepo.count({ where: { enterpriseId: entId, isPublic: 1 } });

    const gradeRows = await base()
      .andWhere('c.isPublic = 0')
      .select('c.grade', 'grade')
      .addSelect('COUNT(1)', 'cnt')
      .groupBy('c.grade')
      .getRawMany();

    const { start, end } = dayRange();
    const todayNew = await base()
      .andWhere('c.isPublic = 0')
      .andWhere('c.createdAt BETWEEN :s AND :e', { s: start, e: end })
      .getCount();

    const followQb = this.followRepo
      .createQueryBuilder('f')
      .where('f.enterpriseId = :entId', { entId });
    applyScope(followQb, user, 'f', 'userId', scopeIds);
    const followTotal = await followQb.getCount();
    const todayFollow = await followQb
      .clone()
      .andWhere('f.createdAt BETWEEN :s AND :e', { s: start, e: end })
      .getCount();

    // 近 7 天新增客户趋势
    const trend: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const r = dayRange(todayStr(d));
      const cnt = await base()
        .andWhere('c.createdAt BETWEEN :s AND :e', { s: r.start, e: r.end })
        .getCount();
      trend.push({ date: todayStr(d), count: cnt });
    }

    const overdue = (await this.overdueCustomers(entId, user, 100)).length;

    return {
      customer_total: total,
      public_total: publicTotal,
      today_new: todayNew,
      follow_total: followTotal,
      today_follow: todayFollow,
      overdue_total: overdue,
      grade_dist: ['A', 'B', 'C', 'D'].map((g) => ({
        grade: g,
        count: Number(gradeRows.find((r) => r.grade === g)?.cnt || 0),
      })),
      trend_7d: trend,
    };
  }
}
