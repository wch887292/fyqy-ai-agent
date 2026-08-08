import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AgentExecLog,
  AgentTask,
  CrmCustomer,
  CrmFollow,
  ErpOrder,
  ErpOrderItem,
  ErpProduct,
  KbDocument,
  ProdWorkOrder,
  SysRole,
  SysUser,
} from '../../entities';
import { AuthUser } from '../../common/auth';
import { snakePage, toSnake } from '../../common/result';
import { bizNo, parsePage } from '../../common/scope';
import { LlmService } from '../../infra/llm/llm.service';
import { NoticeService } from '../notice/notice.service';
import { parseIntId } from '../../common/id.util';
import { cronMatch } from '../../common/cron';

/** 4 套开箱即用智能体模板 */
export const AGENT_TEMPLATES = [
  {
    templateKey: 'sales_assistant',
    agentName: '销售助理智能体',
    triggerType: 'cron',
    cronExpr: '0 0 8,18 * * ?',
    bizPrompt:
      '扫描逾期未跟进客户与沉睡客户，自动生成跟进话术与建议，推送站内消息给对应销售，并预填充销售日报素材。',
    desc: '每日早8点、晚18点执行：找出逾期/沉睡客户，生成跟进话术并推送销售。',
  },
  {
    templateKey: 'risk_inspection',
    agentName: '经营风险巡检智能体',
    triggerType: 'cron',
    cronExpr: '0 0 2 * * ?',
    bizPrompt:
      '扫描异常订单、超期未发货订单、低于预警库存的物料、合伙人长期无跟进客户，汇总风险点并推送企业管理员与对应合伙人。',
    desc: '每日凌晨执行：巡检订单/库存/合伙人风险，汇总推送管理员。',
  },
  {
    templateKey: 'kb_inspection',
    agentName: '知识库巡检智能体',
    triggerType: 'cron',
    cronExpr: '0 0 3 * * 1',
    bizPrompt: '扫描知识库全部文档，识别过时制度、过期报价、重复文档，输出优化建议并通知知识库管理员。',
    desc: '每周一凌晨执行：巡检知识库文档，输出过期/重复优化建议。',
  },
  {
    templateKey: 'order_workorder',
    agentName: '订单工单联动智能体',
    triggerType: 'event',
    cronExpr: '',
    bizPrompt: '监听销售订单审核通过事件，自动生成简易生产工单，填充生产数量与计划完工时间，推送通知生产负责人。',
    desc: '事件触发（订单审核通过）或定时补扫：自动生成生产工单。',
  },
];

@Injectable()
export class AgentService {
  private readonly logger = new Logger('AgentService');

  constructor(
    @InjectRepository(AgentTask) private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentExecLog) private readonly logRepo: Repository<AgentExecLog>,
    @InjectRepository(CrmCustomer) private readonly custRepo: Repository<CrmCustomer>,
    @InjectRepository(CrmFollow) private readonly followRepo: Repository<CrmFollow>,
    @InjectRepository(ErpOrder) private readonly orderRepo: Repository<ErpOrder>,
    @InjectRepository(ErpProduct) private readonly productRepo: Repository<ErpProduct>,
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(ProdWorkOrder) private readonly woRepo: Repository<ProdWorkOrder>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(SysRole) private readonly roleRepo: Repository<SysRole>,
    private readonly llm: LlmService,
    private readonly notice: NoticeService,
  ) {}

  /** 模板列表（前端「模板库」一键导入），出参统一 snake_case */
  templateList() {
    return toSnake(AGENT_TEMPLATES);
  }

  /** 保存任务（新增/编辑） */
  async taskSave(entId: number, user: AuthUser, dto: any) {
    const id = parseIntId(dto.id, '任务ID', true);
    if (id) {
      const task = await this.taskRepo.findOne({ where: { id, enterpriseId: entId } });
      if (!task) throw new BadRequestException('任务不存在');
      Object.assign(task, {
        agentName: dto.agent_name ?? dto.agentName ?? task.agentName,
        triggerType: dto.trigger_type ?? dto.triggerType ?? task.triggerType,
        cronExpr: dto.cron_expr ?? dto.cronExpr ?? task.cronExpr,
        bizPrompt: dto.biz_prompt ?? dto.bizPrompt ?? task.bizPrompt,
        templateKey: dto.template_key ?? dto.templateKey ?? task.templateKey,
        enable: dto.enable ?? task.enable,
      });
      return toSnake(await this.taskRepo.save(task));
    }
    // 新增场景必须校验，否则空值直接撞数据库 NOT NULL，前端只能拿到 500
    const agentName = String(dto.agent_name ?? dto.agentName ?? '').trim();
    const bizPrompt = String(dto.biz_prompt ?? dto.bizPrompt ?? '').trim();
    if (!agentName) throw new BadRequestException('智能体名称不能为空');
    if (!bizPrompt) throw new BadRequestException('业务指令(biz_prompt)不能为空');
    const triggerType = dto.trigger_type ?? dto.triggerType ?? 'cron';
    const cronExpr = String(dto.cron_expr ?? dto.cronExpr ?? '').trim();
    if (triggerType === 'cron' && !cronExpr) throw new BadRequestException('定时触发必须填写 cron 表达式');
    const task = this.taskRepo.create({
      enterpriseId: entId,
      agentName,
      triggerType,
      cronExpr,
      bizPrompt,
      templateKey: dto.template_key ?? dto.templateKey ?? null,
      enable: dto.enable ?? 1,
      createdBy: user.userId,
    });
    return toSnake(await this.taskRepo.save(task));
  }

  /** 任务分页 */
  async taskPage(entId: number, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.taskRepo
      .createQueryBuilder('t')
      .where('t.enterpriseId = :entId', { entId });
    if (query.enable !== undefined && query.enable !== '' && query.enable !== null) {
      qb.andWhere('t.enable = :e', { e: Number(query.enable) });
    }
    if (query.agent_name) qb.andWhere('t.agentName LIKE :n', { n: `%${query.agent_name}%` });
    qb.orderBy('t.createdAt', 'DESC');
    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();
    return snakePage(list, total, page, size);
  }

  /** 启用/禁用 */
  async taskEnable(entId: number, dto: any) {
    const id = parseIntId(dto.task_id ?? dto.taskId ?? dto.id, '任务ID');
    const task = await this.taskRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!task) throw new BadRequestException('任务不存在');
    task.enable = dto.enable ?? (task.enable ? 0 : 1);
    return toSnake(await this.taskRepo.save(task));
  }

  /** 日志分页 */
  async logPage(entId: number, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.logRepo.createQueryBuilder('l').where('l.enterpriseId = :entId', { entId });
    if (query.task_id) qb.andWhere('l.taskId = :tid', { tid: Number(query.task_id) });
    if (query.execute_status) qb.andWhere('l.executeStatus = :s', { s: query.execute_status });
    qb.orderBy('l.startTime', 'DESC');
    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();
    return snakePage(list, total, page, size);
  }

  /** 手动立即执行一次 */
  async manualRun(entId: number, user: AuthUser, taskId: any) {
    const id = parseIntId(taskId, '任务ID');
    const task = await this.taskRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!task) throw new BadRequestException('任务不存在');
    const result = await this.runTask(entId, task, 'manual', user.userId);
    return { log: toSnake(result.log), output: result.output };
  }

  /** 调度器：每分钟扫描到期 cron 任务 */
  async runDueTasks() {
    const tasks = await this.taskRepo.find({ where: { triggerType: 'cron', enable: 1 } });
    const now = new Date();
    for (const t of tasks) {
      if (t.cronExpr && cronMatch(t.cronExpr, now)) {
        try {
          await this.runTask(t.enterpriseId, t, 'cron');
        } catch (e: any) {
          this.logger.warn(`智能体[${t.agentName}]定时执行失败: ${e?.message}`);
        }
      }
    }
  }

  /** 事件触发：订单审核通过 -> 订单工单联动 */
  async onOrderApproved(entId: number, orderId: number) {
    const tasks = await this.taskRepo.find({
      where: { templateKey: 'order_workorder', enable: 1, enterpriseId: entId },
    });
    for (const t of tasks) {
      try {
        await this.runTask(entId, t, 'event', 0);
      } catch (e: any) {
        this.logger.warn(`订单工单联动智能体执行失败: ${e?.message}`);
      }
    }
  }

  /** 执行单个任务，写执行日志 */
  async runTask(entId: number, task: AgentTask, triggerSource = 'manual', operatorId = 0) {
    const log = this.logRepo.create({
      enterpriseId: entId,
      taskId: task.id,
      executeStatus: 'running',
      triggerSource,
      inputParam: JSON.stringify({ agentName: task.agentName, bizPrompt: task.bizPrompt }),
      startTime: new Date(),
    });
    await this.logRepo.save(log);

    try {
      const output = await this.dispatch(entId, task);
      log.executeStatus = 'success';
      log.agentOutput = output;
      log.endTime = new Date();
      task.lastExecuteTime = new Date();
      await this.taskRepo.save(task);
    } catch (e: any) {
      log.executeStatus = 'fail';
      log.errorMsg = e?.message || String(e);
      log.endTime = new Date();
    }
    await this.logRepo.save(log);
    return { log, output: log.agentOutput || '' };
  }

  /** 按模板分派执行逻辑 */
  private async dispatch(entId: number, task: AgentTask): Promise<string> {
    switch (task.templateKey) {
      case 'sales_assistant':
        return this.runSalesAssistant(entId);
      case 'risk_inspection':
        return this.runRiskInspection(entId);
      case 'kb_inspection':
        return this.runKbInspection(entId);
      case 'order_workorder':
        return this.runOrderWorkorder(entId);
      default:
        // 未绑定模板的自定义任务：直接调大模型执行业务指令（无 OpenClaw 时兜底说明）
        const r = await this.llm.complete({
          scene: 'chat',
          enterpriseId: entId,
          prompt: task.bizPrompt,
          payload: { task: task.agentName },
        });
        return r.content;
    }
  }

  /** 模板1：销售助理 */
  private async runSalesAssistant(entId: number): Promise<string> {
    const customers = await this.custRepo.find({ where: { enterpriseId: entId } });
    const follows = await this.followRepo.find({ where: { enterpriseId: entId } });
    const lastFollow = new Map<number, Date>();
    for (const f of follows) {
      const d = new Date(f.createdAt);
      if (!lastFollow.has(f.customerId) || d > lastFollow.get(f.customerId)!) {
        lastFollow.set(f.customerId, d);
      }
    }
    const now = Date.now();
    const overdue: CrmCustomer[] = [];
    for (const c of customers) {
      const lf = lastFollow.get(c.id);
      const days = lf ? (now - lf.getTime()) / 864e5 : 999;
      if (days >= 7) overdue.push(c);
    }
    let pushed = 0;
    for (const c of overdue.slice(0, 20)) {
      if (!c.ownerUserId) continue;
      const r = await this.llm.complete({
        scene: 'follow_suggest',
        enterpriseId: entId,
        prompt: `请为销售「${c.customerName || c.companyName}」生成跟进话术`,
        payload: { followType: '电话', customerName: c.customerName || c.companyName, content: '' },
      });
      await this.notice.send(
        entId,
        c.ownerUserId,
        '智能体提醒：客户跟进',
        `客户「${c.customerName || c.companyName}」已超过7天未跟进，建议今日触达。\n${r.content}`,
        'crm客户',
        c.id,
      );
      pushed++;
    }
    const summary = `销售助理执行完成：共扫描 ${customers.length} 个客户，识别出 ${overdue.length} 个逾期/沉睡客户，已向对应销售推送 ${pushed} 条跟进提醒与话术。`;
    if (overdue.length) {
      const admins = await this.adminUserIds(entId);
      await this.notice.sendToMany(entId, admins, '销售助理巡检日报', summary, 'agent智能体', 0);
    }
    return summary;
  }

  /** 模板2：经营风险巡检 */
  private async runRiskInspection(entId: number): Promise<string> {
    const now = Date.now();
    const orders = await this.orderRepo.find({ where: { enterpriseId: entId } });
    const abnormal = orders.filter(
      (o) => o.orderStatus !== '已完成' && o.orderStatus !== '已取消' && now - new Date(o.createdAt).getTime() > 3 * 864e5,
    );
    const products = await this.productRepo.find({ where: { enterpriseId: entId } });
    const lowStock = products.filter((p) => p.warnStock > 0 && p.stockNum < p.warnStock);
    const summary = `经营风险巡检完成：异常/停滞订单 ${abnormal.length} 笔，低于预警库存物料 ${lowStock.length} 个。`;
    const advice = await this.llm.complete({
      scene: 'risk_advice',
      enterpriseId: entId,
      prompt: summary,
      payload: { riskType: 'order_abnormal' },
    });
    const admins = await this.adminUserIds(entId);
    const details = [
      summary,
      advice.content,
      abnormal.slice(0, 5).map((o) => `· 订单${o.orderNo}（${o.orderStatus}）`).join('\n'),
      lowStock.slice(0, 5).map((p) => `· ${p.productName} 库存${p.stockNum}/${p.warnStock}`).join('\n'),
    ].join('\n');
    await this.notice.sendToMany(entId, admins, '经营风险巡检告警', details, 'warn风险');
    return summary;
  }

  /** 模板3：知识库巡检 */
  private async runKbInspection(entId: number): Promise<string> {
    const docs = await this.docRepo.find({ where: { enterpriseId: entId } });
    const now = Date.now();
    const stale = docs.filter((d) => now - new Date(d.updatedAt).getTime() > 365 * 864e5);
    const summary = `知识库巡检完成：共 ${docs.length} 篇文档，其中 ${stale.length} 篇超过一年未更新，建议复核制度与报价有效性。`;
    const kbAdmins = await this.kbAdminUserIds(entId);
    await this.notice.sendToMany(entId, kbAdmins, '知识库巡检建议', summary, 'kb知识库');
    return summary;
  }

  /** 模板4：订单工单联动（扫描补建） */
  private async runOrderWorkorder(entId: number): Promise<string> {
    const orders = await this.orderRepo.find({
      where: { enterpriseId: entId },
    });
    const approved = orders.filter((o) => o.orderStatus !== '待审核' && o.orderStatus !== '已取消');
    // 已存在工单的订单ID
    const exist = await this.woRepo.find({ where: { enterpriseId: entId } });
    const existOrderIds = new Set(exist.map((w) => w.orderId));
    const items = await this.orderItems(entId, approved.map((o) => o.id));
    let created = 0;
    for (const o of approved) {
      if (existOrderIds.has(o.id)) continue;
      const orderItems = items.filter((it) => it.orderId === o.id);
      if (!orderItems.length) continue;
      // 取第一个明细产品生成工单（简易版：一单多产品则取首个，可扩展为多工单）
      const it = orderItems[0];
      const product = await this.productRepo.findOne({ where: { id: it.productId, enterpriseId: entId } });
      const planDays = 7;
      const planFinish = new Date(Date.now() + planDays * 864e5);
      const wo = this.woRepo.create({
        enterpriseId: entId,
        orderId: o.id,
        workNo: bizNo('WO'),
        productId: it.productId,
        productName: product?.productName || it.productName,
        produceNum: it.num,
        finishNum: 0,
        status: '待排产',
        planFinishTime: planFinish,
        ownerUserId: o.ownerUserId,
      });
      await this.woRepo.save(wo);
      await this.notice.send(
        entId,
        o.ownerUserId,
        '智能体生成生产工单',
        `订单${o.orderNo}审核通过后，已自动生成生产工单${wo.workNo}（产品${wo.productName}，数量${wo.produceNum}）。`,
        'prod工单',
        wo.id,
      );
      created++;
    }
    return `订单工单联动执行完成：扫描已审核订单 ${approved.length} 笔，本次新建生产工单 ${created} 个。`;
  }

  /** 取订单明细（跨表直接查，避免依赖 erp 模块） */
  private async orderItems(entId: number, orderIds: number[]) {
    if (!orderIds.length) return [];
    return this.orderRepo.manager.find(ErpOrderItem, {
      where: { enterpriseId: entId, orderId: In(orderIds) },
    });
  }

  /**
   * 解析企业内每个用户的「合并角色权限」
   * SysUser 只存 roleIds，dataScope / menuCodes 都挂在 SysRole 上，这里聚合一次，
   * 供智能体判断「谁是管理员」「谁该收到知识库巡检通知」。
   */
  private async userPerms(
    entId: number,
  ): Promise<{ id: number; isSuper: boolean; dataScope: number; menuCodes: string[] }[]> {
    const [users, roles] = await Promise.all([
      this.userRepo.find({ where: { enterpriseId: entId, status: 1 } }),
      this.roleRepo.find({ where: { enterpriseId: entId } }),
    ]);
    const roleMap = new Map(roles.map((r) => [Number(r.id), r]));
    return users.map((u) => {
      const ids = String(u.roleIds || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter(Boolean);
      let scope = 1;
      const codes = new Set<string>();
      ids.forEach((rid) => {
        const r = roleMap.get(rid);
        if (!r) return;
        scope = Math.max(scope, Number(r.dataScope || 1));
        String(r.menuCodes || '')
          .split(',')
          .filter(Boolean)
          .forEach((c) => codes.add(c.trim()));
      });
      return {
        id: Number(u.id),
        isSuper: Number(u.isSuper) === 1,
        dataScope: scope,
        menuCodes: [...codes],
      };
    });
  }

  /** 企业管理员用户ID集合（超管，或拥有全企业数据权限） */
  private async adminUserIds(entId: number): Promise<number[]> {
    const perms = await this.userPerms(entId);
    return perms.filter((u) => u.isSuper || u.dataScope >= 3).map((u) => u.id);
  }

  /** 知识库管理员用户ID集合（超管，或拥有 kb:doc / kb:upload 菜单） */
  private async kbAdminUserIds(entId: number): Promise<number[]> {
    const perms = await this.userPerms(entId);
    return perms
      .filter(
        (u) => u.isSuper || u.menuCodes.includes('kb:doc') || u.menuCodes.includes('kb:upload'),
      )
      .map((u) => u.id);
  }
}
