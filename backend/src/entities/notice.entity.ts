import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { T, bigintCol } from '../common/db-types';

/** 站内消息通知（V2.0） */
@Entity('sys_notice')
@Index('idx_ent_user_read', ['enterpriseId', 'receiveUserId', 'isRead'])
export class SysNotice {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'receive_user_id', ...bigintCol(false) })
  receiveUserId: number;

  @Column({ length: 255 })
  title: string;

  @Column({ type: T.text })
  content: string;

  /** 业务类型：crm客户 / erp订单 / prod工单 / partner分利 / warn风险 / agent智能体 */
  @Column({ name: 'biz_type', length: 64, nullable: true })
  bizType: string;

  @Column({ name: 'biz_id', ...bigintCol() })
  bizId: number;

  /** 0未读 1已读 */
  @Column({ name: 'is_read', type: 'tinyint', default: 0 })
  isRead: number;

  @Column({ name: 'created_by', ...bigintCol() })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
