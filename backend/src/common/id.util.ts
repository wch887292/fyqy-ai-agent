import { BadRequestException } from '@nestjs/common';

/**
 * 统一把路由/查询/请求体里的 id 解析为合法正整数。
 *
 * 之前多个端点直接 `Number(query.id)` 或 `Number(body.id)`，
 * 当 id 缺失或非数字时会得到 NaN，拼进 SQL 后抛
 * 「no such column: NaN」的 500，既不友好也暴露了内部错误。
 * 这里统一收敛为 400 业务异常。
 */
export function parseIntId(value: any, label = 'ID'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException(`${label}无效`);
  }
  return n;
}
