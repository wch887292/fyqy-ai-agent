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

/** 简易智能体（V3.0 智能体搭建） */
@Entity('agent_simple')
@Index('idx_ent_simple_type', ['enterpriseId', 'agentType'])
export class AgentSimple {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  /** agent 类型：simple | advanced */
  @Column({ name: 'agent_type', length: 32, default: 'simple' })
  agentType: string;

  /** 智能体名称 */
  @Column({ name: 'agent_name', length: 128 })
  agentName: string;

  /** 智能体头像（图片 URL） */
  @Column({ name: 'avatar', length: 256, nullable: true })
  avatar: string;

  /** 角色设定 / 人设描述 */
  @Column({ name: 'persona', type: T.text, nullable: true })
  persona: string;

  /** 系统提示词（system prompt） */
  @Column({ name: 'system_prompt', type: T.text })
  systemPrompt: string;

  /** 关联的知识库文档 ID（逗号分隔） */
  @Column({ name: 'kb_doc_ids', type: T.text, nullable: true })
  kbDocIds: string;

  /** 回答风格：concise | detailed | friendly | professional */
  @Column({ name: 'answer_style', length: 32, default: 'detailed' })
  answerStyle: string;

  /** 温度参数 0~1 */
  @Column({ name: 'temperature', type: 'float', default: 0.7 })
  temperature: number;

  /** 最大 token 数 */
  @Column({ name: 'max_tokens', type: 'int', default: 2048 })
  maxTokens: number;

  /** 是否开启知识库引用展示 */
  @Column({ name: 'show_refs', type: 'tinyint', default: 1 })
  showRefs: number;

  /** 0禁用 1启用 */
  @Column({ type: 'tinyint', default: 1 })
  enable: number;

  /** 访问密码（为空则公开） */
  @Column({ name: 'access_pwd', length: 64, nullable: true })
  accessPwd: string;

  @Column({ name: 'created_by', ...bigintCol() })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: T.datetime, nullable: true })
  updatedAt: Date;
}

/** 高级智能体工作流节点 */
@Entity('agent_advanced_node')
@Index('idx_adv_node_flow', ['flowId'])
export class AgentAdvancedNode {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'flow_id', ...bigintCol(false) })
  flowId: number;

  /** node 类型：input | filter | llm | kb_search | function_call | output */
  @Column({ name: 'node_type', length: 32 })
  nodeType: string;

  /** 节点名称 */
  @Column({ name: 'node_name', length: 128 })
  nodeName: string;

  /** 节点配置（JSON） */
  @Column({ name: 'node_config', type: T.text })
  nodeConfig: string;

  /** 排序权重 */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'created_by', ...bigintCol() })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** 高级智能体工作流 */
@Entity('agent_advanced')
@Index('idx_ent_adv_type', ['enterpriseId', 'agentType'])
export class AgentAdvanced {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  /** agent 类型：simple | advanced */
  @Column({ name: 'agent_type', length: 32, default: 'advanced' })
  agentType: string;

  /** 智能体名称 */
  @Column({ name: 'agent_name', length: 128 })
  agentName: string;

  /** 智能体头像（图片 URL） */
  @Column({ name: 'avatar', length: 256, nullable: true })
  avatar: string;

  /** 工作流描述 */
  @Column({ name: 'description', type: T.text, nullable: true })
  description: string;

  /** 入口问题预设（JSON 数组） */
  @Column({ name: 'input_questions', type: T.text, nullable: true })
  inputQuestions: string;

  /** 是否开启问题优化（意图识别 + 问题补全） */
  @Column({ name: 'enable_q_optimize', type: 'tinyint', default: 1 })
  enableQOptimize: number;

  /** 是否开启敏感词过滤 */
  @Column({ name: 'enable_safety', type: 'tinyint', default: 1 })
  enableSafety: number;

  /** 敏感词列表（逗号分隔） */
  @Column({ name: 'sensitive_words', type: T.text, nullable: true })
  sensitiveWords: string;

  /** 关联知识库文档 ID（逗号分隔） */
  @Column({ name: 'kb_doc_ids', type: T.text, nullable: true })
  kbDocIds: string;

  /** 0禁用 1启用 */
  @Column({ type: 'tinyint', default: 1 })
  enable: number;

  @Column({ name: 'created_by', ...bigintCol() })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: T.datetime, nullable: true })
  updatedAt: Date;
}

/** 智能体问答执行记录（简易/高级共用） */
@Entity('agent_exec_record')
@Index('idx_exec_agent', ['agentId'])
@Index('idx_exec_ent_time', ['enterpriseId', 'createdAt'])
export class AgentExecRecord {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'agent_id', ...bigintCol(false) })
  agentId: number;

  /** simple | advanced */
  @Column({ name: 'agent_type', length: 32 })
  agentType: string;

  /** 用户问题 */
  @Column({ name: 'question', type: T.text })
  question: string;

  /** AI 回答 */
  @Column({ name: 'answer', type: T.longtext })
  answer: string;

  /** 引用的知识库片段（JSON 数组） */
  @Column({ name: 'refs', type: T.text, nullable: true })
  refs: string;

  /** 耗时毫秒 */
  @Column({ name: 'cost_ms', type: 'int', default: 0 })
  costMs: number;

  /** success | fail */
  @Column({ name: 'exec_status', length: 32, default: 'success' })
  execStatus: string;

  /** 错误信息 */
  @Column({ name: 'error_msg', type: T.text, nullable: true })
  errorMsg: string;

  @Column({ name: 'created_by', ...bigintCol(), nullable: true })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
