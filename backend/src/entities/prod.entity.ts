import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { T, bigintCol, moneyCol } from '../common/db-types';

/** 工单状态流转：待排产 -> 生产中 -> 部分完成 -> 全部完工 -> 已取消 */
export const WORK_ORDER_STATUS = ['待排产', '生产中', '部分完成', '全部完工', '已取消'] as const;

/** 简易生产工单主表（V2.0） */
@Entity('prod_work_order')
@Index('idx_ent_order', ['enterpriseId', 'orderId'])
export class ProdWorkOrder {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  /** 关联销售订单ID */
  @Column({ name: 'order_id', ...bigintCol(false) })
  orderId: number;

  /** 工单号 */
  @Column({ name: 'work_no', length: 64 })
  workNo: string;

  @Column({ name: 'product_id', ...bigintCol(false) })
  productId: number;

  @Column({ name: 'product_name', length: 255, nullable: true })
  productName: string;

  /** 生产数量 */
  @Column({ name: 'produce_num', type: 'int', default: 0 })
  produceNum: number;

  /** 已完成数量 */
  @Column({ name: 'finish_num', type: 'int', default: 0 })
  finishNum: number;

  /** 待排产｜生产中｜部分完成｜全部完工｜已取消 */
  @Column({ name: 'status', length: 32, default: '待排产' })
  status: string;

  @Column({ name: 'plan_finish_time', type: T.datetime, nullable: true })
  planFinishTime: Date;

  @Column({ name: 'actual_finish_time', type: T.datetime, nullable: true })
  actualFinishTime: Date;

  /** AI 生产提示（工期预估 / 缺料提醒） */
  @Column({ name: 'ai_tip', type: T.text, nullable: true })
  aiTip: string;

  @Column({ name: 'owner_user_id', ...bigintCol() })
  ownerUserId: number;

  @Column({ length: 512, nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
