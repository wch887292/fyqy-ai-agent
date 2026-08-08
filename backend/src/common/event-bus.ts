import { EventEmitter } from 'events';

/**
 * 进程内业务事件总线
 *
 * 用于解耦模块间的「事件触发」联动，例如：
 *   - 销售订单审核通过  -> 自动生成生产工单、自动生成合伙人结算流水
 *   - 合伙人客户长期无跟进 -> 风险告警
 *
 * 选择进程内 EventEmitter 而不是 @nestjs/event-emitter，是为了不引入额外依赖，
 * 同时保持单进程（dev SQLite / 单 backend 容器）下的强一致性与零延迟。
 * 若未来拆成多实例部署，可平滑替换为 Redis 发布订阅。
 */
export const bizEvents = new EventEmitter();
bizEvents.setMaxListeners(50);

/** 业务事件名常量 */
export const BizEvent = {
  /** 订单状态变更：payload { entId, orderId, orderNo, status, customerId, ownerUserId, items } */
  ORDER_STATUS_CHANGED: 'order.statusChanged',
  /** 订单审核通过（待审核 -> 其它）：同 ORDER_STATUS_CHANGED 但语义更明确 */
  ORDER_APPROVED: 'order.approved',
} as const;
