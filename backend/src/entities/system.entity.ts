import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { T, bigintCol } from '../common/db-types';

/** 企业级系统配置（含 OpenClaw 大模型参数） */
@Entity('sys_config')
@Index('idx_cfg_ent_key', ['enterpriseId', 'configKey'])
export class SysConfig {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'config_key', length: 64 })
  configKey: string;

  @Column({ name: 'config_value', type: T.text, nullable: true })
  configValue: string;

  @Column({ length: 255, nullable: true })
  remark: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** 操作日志 */
@Entity('sys_oper_log')
@Index('idx_log_ent_time', ['enterpriseId', 'createdAt'])
export class SysOperLog {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', type: T.bigint, default: 0 })
  enterpriseId: number;

  @Column({ name: 'user_id', ...bigintCol() })
  userId: number;

  @Column({ length: 64, nullable: true })
  username: string;

  @Column({ length: 64, nullable: true })
  module: string;

  @Column({ length: 128, nullable: true })
  action: string;

  @Column({ length: 16, nullable: true })
  method: string;

  @Column({ length: 255, nullable: true })
  url: string;

  @Column({ length: 64, nullable: true })
  ip: string;

  @Column({ type: T.text, nullable: true })
  params: string;

  @Column({ type: 'tinyint', default: 1 })
  success: number;

  @Column({ name: 'error_msg', type: T.text, nullable: true })
  errorMsg: string;

  @Column({ name: 'cost_ms', type: 'int', default: 0 })
  costMs: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
