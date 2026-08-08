import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { T, bigintCol } from '../common/db-types';

/**
 * 客户主表
 * 字段严格遵循产品规范：公司名称、客户姓名、联系电话、联系时间、备注
 * 业务规则：contact_time 由服务器实时写入，不接受前端传值
 */
@Entity('crm_customer')
@Index('idx_cust_ent_owner', ['enterpriseId', 'ownerUserId'])
export class CrmCustomer {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'company_name', length: 255, nullable: true, comment: '公司名称' })
  companyName: string;

  @Column({ name: 'customer_name', length: 128, comment: '客户姓名' })
  customerName: string;

  @Column({ length: 32, nullable: true, comment: '联系电话' })
  phone: string;

  @Column({ name: 'contact_time', type: T.datetime, nullable: true, comment: '联系时间，服务器实时写入' })
  contactTime: Date;

  @Column({ type: T.text, nullable: true, comment: '备注' })
  remark: string;

  @Column({ length: 512, nullable: true, comment: '客户标签' })
  tags: string;

  @Column({ length: 16, default: 'C', comment: 'A高意向/B潜客/C普通/D沉睡' })
  grade: string;

  @Column({ name: 'intention_score', type: 'int', default: 0, comment: 'AI意向打分0-100' })
  intentionScore: number;

  @Column({ name: 'ai_analysis', type: T.text, nullable: true, comment: 'AI意向分析说明' })
  aiAnalysis: string;

  @Column({ name: 'owner_user_id', ...bigintCol() })
  ownerUserId: number;

  @Column({ name: 'dept_id', ...bigintCol() })
  deptId: number;

  @Column({ name: 'is_public', type: 'tinyint', default: 0, comment: '是否公海客户' })
  isPublic: number;

  @Column({ name: 'last_follow_time', type: T.datetime, nullable: true })
  lastFollowTime: Date;

  @Column({ name: 'next_follow_time', type: T.datetime, nullable: true })
  nextFollowTime: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** 客户跟进记录 */
@Entity('crm_follow')
@Index('idx_follow_cust', ['customerId'])
export class CrmFollow {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'customer_id', ...bigintCol(false) })
  customerId: number;

  @Column({ name: 'user_id', ...bigintCol(false) })
  userId: number;

  @Column({ name: 'follow_type', length: 32, comment: '电话/微信/拜访/其他' })
  followType: string;

  @Column({ type: T.text })
  content: string;

  @Column({ name: 'next_follow_time', type: T.datetime, nullable: true })
  nextFollowTime: Date;

  @Column({ name: 'ai_suggest', type: T.text, nullable: true, comment: 'AI跟进建议与话术' })
  aiSuggest: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/**
 * 销售日报（固定模板，不可增删字段）
 * 今日成果：电话量 / 微信添加 / 新增意向客户 / 约拜访
 * 心得体会 + 明日工作计划
 */
@Entity('crm_daily_report')
@Index('idx_report_ent_date', ['enterpriseId', 'reportDate'])
export class CrmDailyReport {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'user_id', ...bigintCol(false) })
  userId: number;

  @Column({ name: 'report_date', type: T.date })
  reportDate: string;

  @Column({ name: 'call_cnt', type: 'int', default: 0, comment: '电话量' })
  callCnt: number;

  @Column({ name: 'wechat_add_cnt', type: 'int', default: 0, comment: '微信添加' })
  wechatAddCnt: number;

  @Column({ name: 'intention_cust_cnt', type: 'int', default: 0, comment: '新增意向客户' })
  intentionCustCnt: number;

  @Column({ name: 'visit_cnt', type: 'int', default: 0, comment: '约拜访/面访' })
  visitCnt: number;

  @Column({ type: T.text, nullable: true, comment: '今日心得体会' })
  experience: string;

  @Column({ name: 'tomorrow_plan', type: T.text, nullable: true, comment: '明日工作计划' })
  tomorrowPlan: string;

  @Column({ name: 'ai_auto_content', type: T.text, nullable: true, comment: 'AI自动生成日报内容' })
  aiAutoContent: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
