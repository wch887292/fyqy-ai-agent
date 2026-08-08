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
