/**
 * 跨数据库列类型适配
 *
 * 同一套 Entity 定义要同时跑在 SQLite(本地dev) 和 MySQL(生产prod) 上，
 * 两者类型系统差异必须在这里统一抹平，否则实体层会被迫写两套。
 *
 * 关键差异：
 *  1. SQLite 自增主键只认 INTEGER，不认 bigint
 *  2. SQLite 没有 longtext，统一降级为 text
 *  3. MySQL 的 bigint / decimal 经驱动返回的是 string，需转回 number
 */
const isSqlite = (process.env.DB_DRIVER || (process.env.APP_MODE === 'prod' ? 'mysql' : 'sqlite')) !== 'mysql';

/** MySQL 的 bigint、decimal 返回字符串，统一转成数字，避免前端拿到 "123" 这种脏数据 */
export const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: any): number => {
    if (value === null || value === undefined || value === '') return null as any;
    const n = Number(value);
    return Number.isNaN(n) ? (value as any) : n;
  },
};

export const decimalTransformer = {
  to: (value: number | null): number | null => (value === null || value === undefined ? 0 : value),
  from: (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  },
};

export const T = {
  isSqlite,
  /** 自增主键类型 */
  pk: (isSqlite ? 'integer' : 'bigint') as any,
  /** 外键 / 大整数 */
  bigint: (isSqlite ? 'integer' : 'bigint') as any,
  /** 超长文本 */
  longtext: (isSqlite ? 'text' : 'longtext') as any,
  text: 'text' as any,
  datetime: 'datetime' as any,
  date: 'date' as any,
  decimal: 'decimal' as any,
};

/** 大整数列的通用配置 */
export const bigintCol = (nullable = true) => ({
  type: T.bigint,
  nullable,
  transformer: numericTransformer,
});

/** 金额列的通用配置 */
export const moneyCol = () => ({
  type: T.decimal,
  precision: 12,
  scale: 2,
  default: 0,
  transformer: decimalTransformer,
});

/** 比例列（百分比）的通用配置 */
export const ratioCol = () => ({
  type: T.decimal,
  precision: 5,
  scale: 2,
  default: 0,
  transformer: decimalTransformer,
});
