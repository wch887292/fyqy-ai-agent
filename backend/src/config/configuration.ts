/**
 * 全局配置加载器
 * 飞虹智-企业AI一站式平台 · 飞扬企源研发中心
 *
 * 双模式设计：
 *   APP_MODE=dev  -> SQLite + 内存向量 + 本地磁盘 + LLM 自动降级，零外部依赖
 *   APP_MODE=prod -> MySQL  + Milvus   + MinIO     + OpenClaw
 */
export interface AppConfig {
  mode: 'dev' | 'prod';
  port: number;
  appName: string;
  jwt: { secret: string; expiresIn: string };
  db: {
    driver: 'sqlite' | 'mysql';
    sqliteFile: string;
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    synchronize: boolean;
  };
  vector: { driver: 'memory' | 'milvus'; host: string; port: number; dim: number };
  storage: {
    driver: 'local' | 'minio';
    localDir: string;
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
  llm: {
    endpoint: string;
    apiKey: string;
    model: string;
    timeout: number;
    embeddingEndpoint: string;
    embeddingModel: string;
  };
  biz: { crmPageSize: number; followOverdueDays: number };
}

const bool = (v: string | undefined, def: boolean): boolean =>
  v === undefined || v === '' ? def : v === 'true' || v === '1';

const num = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : def;
};

export default (): AppConfig => {
  const mode = (process.env.APP_MODE === 'prod' ? 'prod' : 'dev') as 'dev' | 'prod';
  // 未显式指定时，按运行模式给出安全的默认值
  const driverDefault = mode === 'prod' ? 'mysql' : 'sqlite';
  const vectorDefault = mode === 'prod' ? 'milvus' : 'memory';
  const storageDefault = mode === 'prod' ? 'minio' : 'local';

  return {
    mode,
    port: num(process.env.APP_PORT, 8080),
    appName: process.env.APP_NAME || '飞虹智-企业AI一站式平台',
    jwt: {
      secret: process.env.JWT_SECRET || 'fae-feihongzhi-2026-dev-secret',
      expiresIn: process.env.JWT_EXPIRES_IN || '12h',
    },
    db: {
      driver: (process.env.DB_DRIVER || driverDefault) as 'sqlite' | 'mysql',
      sqliteFile: process.env.DB_SQLITE_FILE || './data/fae_enterprise.db',
      host: process.env.DB_HOST || '127.0.0.1',
      port: num(process.env.DB_PORT, 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Root@123456',
      name: process.env.DB_NAME || 'fae_enterprise',
      synchronize: bool(process.env.DB_SYNCHRONIZE, mode === 'dev'),
    },
    vector: {
      driver: (process.env.VECTOR_DRIVER || vectorDefault) as 'memory' | 'milvus',
      host: process.env.MILVUS_HOST || '127.0.0.1',
      port: num(process.env.MILVUS_PORT, 19530),
      dim: num(process.env.VECTOR_DIM, 512),
    },
    storage: {
      driver: (process.env.STORAGE_DRIVER || storageDefault) as 'local' | 'minio',
      localDir: process.env.STORAGE_LOCAL_DIR || './data/uploads',
      endpoint: process.env.MINIO_ENDPOINT || 'http://127.0.0.1:9000',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'Minio@123456',
      bucket: process.env.MINIO_BUCKET || 'fae',
    },
    llm: {
      endpoint: process.env.LLM_API_ENDPOINT || '',
      apiKey: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL_NAME || 'openclaw-enterprise',
      timeout: num(process.env.LLM_TIMEOUT_MS, 60000),
      embeddingEndpoint: process.env.EMBEDDING_API_ENDPOINT || '',
      embeddingModel: process.env.EMBEDDING_MODEL_NAME || '',
    },
    biz: {
      crmPageSize: num(process.env.CRM_PAGE_SIZE, 10),
      followOverdueDays: num(process.env.CRM_FOLLOW_OVERDUE_DAYS, 7),
    },
  };
};
