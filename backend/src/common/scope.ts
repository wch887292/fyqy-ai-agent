import { SelectQueryBuilder } from 'typeorm';
import { AuthUser } from './auth';

/** 数据权限：1本人 2本部门 3全企业 */
export const DataScope = { SELF: 1, DEPT: 2, ALL: 3 } as const;

/**
 * 给查询构造器追加数据权限过滤
 *
 * 规则（对应 PRD 2.3 鉴权：菜单权限 + 数据权限双重控制）：
 *   全企业  -> 不加限制
 *   本部门  -> 归属人在本部门内（含本人）
 *   本人    -> 仅归属人是自己
 *
 * @param alias      表别名
 * @param ownerField 归属人字段名（实体属性名）
 * @param deptField  部门字段名，缺省则本部门降级为本人
 * @param deptUserIds 本部门用户ID集合，由调用方预先查出
 */
export function applyScope<T extends object>(
  qb: SelectQueryBuilder<T>,
  user: AuthUser,
  alias: string,
  ownerField = 'ownerUserId',
  deptUserIds?: number[],
): SelectQueryBuilder<T> {
  if (user.isSuper || user.dataScope >= DataScope.ALL) return qb;

  if (user.dataScope === DataScope.DEPT) {
    const ids = deptUserIds?.length ? deptUserIds : [user.userId];
    qb.andWhere(`${alias}.${ownerField} IN (:...scopeUserIds)`, { scopeUserIds: ids });
    return qb;
  }

  qb.andWhere(`${alias}.${ownerField} = :scopeSelfId`, { scopeSelfId: user.userId });
  return qb;
}

/** 是否有权操作指定归属人的数据 */
export function canOperate(user: AuthUser, ownerUserId: number, deptUserIds?: number[]): boolean {
  if (user.isSuper || user.dataScope >= DataScope.ALL) return true;
  if (user.dataScope === DataScope.DEPT) {
    return (deptUserIds || [user.userId]).includes(Number(ownerUserId));
  }
  return Number(ownerUserId) === Number(user.userId);
}

/** 统一分页参数解析 */
export function parsePage(query: any, defaultSize = 10, maxSize = 200) {
  const page = Math.max(1, Number(query?.page ?? query?.pageNum ?? 1) || 1);
  const rawSize = Number(query?.size ?? query?.pageSize ?? defaultSize) || defaultSize;
  const size = Math.min(maxSize, Math.max(1, rawSize));
  return { page, size, skip: (page - 1) * size, take: size };
}

/** 生成业务单号：前缀 + yyyyMMddHHmmss + 3位随机 */
export function bizNo(prefix: string): string {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return (
    prefix +
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds()) +
    p(Math.floor(Math.random() * 1000), 3)
  );
}

/** 本地日期字符串 yyyy-MM-dd */
export function todayStr(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 当日起止时间 */
export function dayRange(dateStr?: string): { start: Date; end: Date } {
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0);
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59);
  return { start, end };
}
