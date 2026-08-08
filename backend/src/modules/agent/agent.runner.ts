import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AgentService } from './agent.service';
import { bizEvents, BizEvent } from '../../common/event-bus';

/**
 * 智能体调度运行服务（对应文档中的 agent-scheduler 逻辑服务）
 *
 * 复用全局已启用的 @nestjs/schedule，每分钟扫描到期 cron 任务并执行；
 * 同时监听「订单审核通过」事件，驱动订单-工单联动智能体。
 * 该服务随后端主进程启动，单进程部署即可，生产可按同镜像拆分独立实例。
 */
@Injectable()
export class AgentRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AgentRunner');
  private orderHandler: (p: any) => void;

  constructor(private readonly agentSvc: AgentService) {}

  onModuleInit() {
    this.orderHandler = (p: { entId: number; orderId: number }) => {
      this.agentSvc
        .onOrderApproved(p.entId, p.orderId)
        .catch((e) => this.logger.warn(`订单工单联动智能体失败: ${e?.message}`));
    };
    bizEvents.on(BizEvent.ORDER_APPROVED, this.orderHandler);
    this.logger.log('智能体调度器已就绪（cron 每分钟扫描 + 订单事件监听）');
  }

  onModuleDestroy() {
    if (this.orderHandler) bizEvents.off(BizEvent.ORDER_APPROVED, this.orderHandler);
  }

  /** 每分钟扫描到期 cron 任务（文档内置模板：早8/晚18、凌晨2点、周一凌晨3点） */
  @Interval(60_000)
  async tick() {
    try {
      await this.agentSvc.runDueTasks();
    } catch (e: any) {
      this.logger.warn(`智能体定时扫描异常: ${e?.message}`);
    }
  }
}
