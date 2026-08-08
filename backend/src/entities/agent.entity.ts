import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { T, bigintCol } from '../common/db-types';

/** OpenClaw 智能体任务配置（V2.0 核心） */
@Entity('agent_task')
@Index('idx_ent_enable', ['enterpriseId', 'enable'])
export class AgentTask {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  /** 智能体名称：销售助理智能体 / 经营风险巡检 / 知识库巡检 / 订单工单联动 */
  @Column({ name: 'agent_name', length: 128 })
  agentName: string;

  /** cron定时 / event事件触发 */
  @Column({ name: 'trigger_type', length: 32, default: 'cron' })
  triggerType: string;

  /** cron 表达式，例如 0 0 8,18 * * ? */
  @Column({ name: 'cron_expr', length: 64, nullable: true })
  cronExpr: string;

  /** 0禁用 1启用 */
  @Column({ type: 'tinyint', default: 1 })
  enable: number;

  /** 给到 OpenClaw 的业务指令 prompt */
  @Column({ name: 'biz_prompt', type: T.text })
  bizPrompt: string;

  /** 模板标识：sales_assistant / risk_inspection / kb_inspection / order_workorder */
  @Column({ name: 'template_key', length: 48, nullable: true })
  templateKey: string;

  @Column({ name: 'last_execute_time', type: T.datetime, nullable: true })
  lastExecuteTime: Date;

  @Column({ name: 'created_by', ...bigintCol() })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** 智能体执行日志 */
@Entity('agent_exec_log')
@Index('idx_taskid', ['taskId'])
export class AgentExecLog {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'task_id', ...bigintCol(false) })
  taskId: number;

  /** running / success / fail */
  @Column({ name: 'execute_status', length: 32, default: 'running' })
  executeStatus: string;

  /** 触发方式：cron / manual / event */
  @Column({ name: 'trigger_source', length: 32, default: 'manual' })
  triggerSource: string;

  @Column({ name: 'input_param', type: T.text, nullable: true })
  inputParam: string;

  @Column({ name: 'agent_output', type: T.longtext, nullable: true })
  agentOutput: string;

  @Column({ name: 'error_msg', type: T.text, nullable: true })
  errorMsg: string;

  @Column({ name: 'start_time', type: T.datetime, default: () => 'CURRENT_TIMESTAMP' })
  startTime: Date;

  @Column({ name: 'end_time', type: T.datetime, nullable: true })
  endTime: Date;
}
