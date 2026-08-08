/**
 * 统一响应结构：{ code, msg, data }
 * 全平台所有接口返回格式一致，前端只需判断 code === 0
 */
export class R {
  code: number;
  msg: string;
  data: any;

  static ok<T>(data: T = null as any, msg = 'success') {
    return { code: 0, msg, data };
  }

  static fail(msg = '操作失败', code = 500, data: any = null) {
    return { code, msg, data };
  }
}

/** 分页返回结构 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const pageResult = <T>(list: T[], total: number, page: number, size: number): PageResult<T> => ({
  list,
  total,
  page,
  size,
  pages: size > 0 ? Math.ceil(total / size) : 0,
});

/**
 * 实体 -> 出参序列化：把 camelCase 属性名转成项目统一的 snake_case 出参风格。
 *
 * 背景：V1.0 各服务是逐字段手写 { user_id: r.userId } 映射，前端全量按 snake_case 读取。
 * V2.0 新增模块若直接把 TypeORM 实体丢给前端，字段名会变成 camelCase 导致前端读空，
 * 因此新增接口统一走这里，既保持出参风格一致，又不必逐字段手抄。
 *
 * 注意：只转换对象的「键名」，Date / Buffer / 数组元素的值原样保留。
 */
export function toSnake<T = any>(input: any): T {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map((i) => toSnake(i)) as any;
  if (input instanceof Date || Buffer.isBuffer(input)) return input as any;
  if (typeof input !== 'object') return input;

  const out: any = {};
  for (const [k, v] of Object.entries(input)) {
    const key = k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    out[key] = toSnake(v);
  }
  return out;
}

/** 分页 + snake_case 出参（V2.0 新增模块统一使用） */
export const snakePage = <T>(list: T[], total: number, page: number, size: number) =>
  pageResult(toSnake<any[]>(list), total, page, size);

/** 业务错误码 */
export enum BizCode {
  SUCCESS = 0,
  PARAM_ERROR = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  /** 跨租户越权访问，安全审计重点关注 */
  TENANT_VIOLATION = 4030,
  SERVER_ERROR = 500,
}
