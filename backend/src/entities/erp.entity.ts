import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { T, bigintCol, moneyCol } from '../common/db-types';

/** 订单状态流转枚举 */
export const ORDER_STATUS = ['待审核', '生产中', '已发货', '已完成', '已取消'] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

/** 合法的状态流转路径（防止乱跳状态） */
export const ORDER_STATUS_FLOW: Record<string, string[]> = {
  待审核: ['生产中', '已取消'],
  生产中: ['已发货', '已取消'],
  已发货: ['已完成'],
  已完成: [],
  已取消: [],
};

/** 产品档案 */
@Entity('erp_product')
@Index('idx_prod_ent', ['enterpriseId'])
export class ErpProduct {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'product_code', length: 64, nullable: true })
  productCode: string;

  @Column({ name: 'product_name', length: 255 })
  productName: string;

  @Column({ length: 255, nullable: true, comment: '规格型号' })
  spec: string;

  @Column({ length: 16, default: '件' })
  unit: string;

  @Column({ name: 'price', ...moneyCol(), comment: '销售单价' })
  price: number;

  @Column({ name: 'cost_price', ...moneyCol(), comment: '成本价' })
  costPrice: number;

  @Column({ name: 'stock_num', type: 'int', default: 0, comment: '当前库存' })
  stockNum: number;

  @Column({ name: 'warn_stock', type: 'int', default: 0, comment: '预警库存' })
  warnStock: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** 出入库流水 */
@Entity('erp_stock_record')
@Index('idx_stock_ent_prod', ['enterpriseId', 'productId'])
export class ErpStockRecord {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'product_id', ...bigintCol(false) })
  productId: number;

  @Column({ length: 16, comment: 'in入库 / out出库' })
  type: string;

  @Column({ type: 'int' })
  num: number;

  @Column({ name: 'before_num', type: 'int', default: 0 })
  beforeNum: number;

  @Column({ name: 'after_num', type: 'int', default: 0 })
  afterNum: number;

  @Column({ name: 'biz_type', length: 32, default: 'manual' })
  bizType: string;

  @Column({ name: 'biz_id', ...bigintCol() })
  bizId: number;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ name: 'operator_id', ...bigintCol() })
  operatorId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** 库存缺货预警记录 */
@Entity('erp_stock_warn')
@Index('idx_warn_ent_handled', ['enterpriseId', 'handled'])
export class ErpStockWarn {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'product_id', ...bigintCol(false) })
  productId: number;

  @Column({ name: 'product_name', length: 255, nullable: true })
  productName: string;

  @Column({ name: 'stock_num', type: 'int', default: 0 })
  stockNum: number;

  @Column({ name: 'warn_stock', type: 'int', default: 0 })
  warnStock: number;

  @Column({ name: 'ai_advice', type: T.text, nullable: true, comment: 'AI补货建议' })
  aiAdvice: string;

  @Column({ type: 'tinyint', default: 0, comment: '0未处理 1已处理' })
  handled: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** 销售订单主表 */
@Entity('erp_order')
@Index('idx_order_ent_status', ['enterpriseId', 'orderStatus'])
export class ErpOrder {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'order_no', length: 64 })
  orderNo: string;

  @Column({ name: 'customer_id', ...bigintCol(false) })
  customerId: number;

  @Column({ name: 'customer_name', length: 128, nullable: true })
  customerName: string;

  @Column({ name: 'total_amount', ...moneyCol() })
  totalAmount: number;

  @Column({ name: 'order_status', length: 32, default: '待审核' })
  orderStatus: string;

  @Column({ name: 'owner_user_id', ...bigintCol() })
  ownerUserId: number;

  @Column({ name: 'delivery_date', type: T.date, nullable: true, comment: '交期' })
  deliveryDate: string;

  @Column({ name: 'ai_warn_msg', type: T.text, nullable: true, comment: 'AI异常预警信息' })
  aiWarnMsg: string;

  @Column({ length: 512, nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** 销售订单明细 */
@Entity('erp_order_item')
@Index('idx_item_order', ['orderId'])
export class ErpOrderItem {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'order_id', ...bigintCol(false) })
  orderId: number;

  @Column({ name: 'product_id', ...bigintCol(false) })
  productId: number;

  @Column({ name: 'product_name', length: 255, nullable: true })
  productName: string;

  @Column({ length: 255, nullable: true })
  spec: string;

  @Column({ name: 'price', ...moneyCol() })
  price: number;

  @Column({ type: 'int', default: 0 })
  num: number;

  @Column({ name: 'amount', ...moneyCol() })
  amount: number;
}
