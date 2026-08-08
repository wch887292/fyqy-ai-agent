import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { T, bigintCol, moneyCol, ratioCol } from '../common/db-types';

/**
 * 合伙人分权配置
 * 对应飞扬企源独家体系：分权 / 分利 / 分风险 —— 本表承载「分权」
 */
@Entity('partner_config')
@Index('idx_pc_ent_user', ['enterpriseId', 'userId'])
export class PartnerConfig {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'user_id', ...bigintCol(false) })
  userId: number;

  @Column({ name: 'partner_type', length: 32, default: '业务合伙人' })
  partnerType: string;

  @Column({ name: 'data_scope', type: 'tinyint', default: 1, comment: '1本人 2本部门 3全企业' })
  dataScope: number;

  @Column({ name: 'menu_codes', type: T.text, nullable: true })
  menuCodes: string;

  @Column({ name: 'default_ratio', ...ratioCol(), comment: '默认分成比例%' })
  defaultRatio: number;

  @Column({ type: 'tinyint', default: 1 })
  enable: number;

  @Column({ length: 512, nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/**
 * 合伙人业绩归属台账 —— 承载「分利」
 * V1.0 边界：只做台账登记与预估分成，实发分红核算放到 V2.0
 */
@Entity('partner_performance')
@Index('idx_pp_ent_uid', ['enterpriseId', 'userId'])
export class PartnerPerformance {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'user_id', ...bigintCol(false) })
  userId: number;

  @Column({ name: 'order_id', ...bigintCol() })
  orderId: number;

  @Column({ name: 'order_no', length: 64, nullable: true })
  orderNo: string;

  @Column({ name: 'performance_amount', ...moneyCol(), comment: '业绩金额' })
  performanceAmount: number;

  @Column({ name: 'ratio', ...ratioCol(), comment: '分成比例%' })
  ratio: number;

  @Column({ name: 'estimate_amount', ...moneyCol(), comment: '预估分成金额' })
  estimateAmount: number;

  @Column({ length: 16, nullable: true, comment: '归属期间 YYYY-MM' })
  period: string;

  @Column({ length: 512, nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** 合伙人风险预警记录 —— 承载「分风险」 */
@Entity('partner_risk')
@Index('idx_pr_ent_uid', ['enterpriseId', 'userId'])
export class PartnerRisk {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'user_id', ...bigintCol(false) })
  userId: number;

  @Column({ name: 'risk_type', length: 32, comment: 'follow_overdue/order_abnormal/stock_warn' })
  riskType: string;

  @Column({ name: 'biz_id', ...bigintCol() })
  bizId: number;

  @Column({ name: 'risk_level', length: 16, default: '中' })
  riskLevel: string;

  @Column({ type: T.text })
  content: string;

  @Column({ name: 'ai_advice', type: T.text, nullable: true })
  aiAdvice: string;

  @Column({ type: 'tinyint', default: 0 })
  handled: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
