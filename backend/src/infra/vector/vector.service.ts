import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { KbChunk } from '../../entities';
import { EmbeddingService } from './embedding.service';

export interface SearchHit {
  chunkId: number;
  docId: number;
  content: string;
  score: number;
}

/**
 * 向量检索服务
 *
 * 两种后端，通过 VECTOR_DRIVER 切换，业务层无感知：
 *   memory —— 向量存于 kb_chunk.embedding，进程内缓存 + 余弦计算。
 *             零外部依赖，十万级切片内完全够用，适合单机私有化。
 *   milvus —— 生产大规模场景，动态加载 @zilliz/milvus2-sdk-node。
 *
 * 租户隔离：所有检索强制按 enterprise_id 过滤，
 * memory 模式在 SQL 层过滤，milvus 模式用 partition + 表达式双重过滤。
 */
@Injectable()
export class VectorService implements OnModuleInit {
  private readonly logger = new Logger('VectorService');
  private readonly driver: 'memory' | 'milvus';
  private readonly collection = 'fae_kb_chunk';
  private milvus: any = null;

  /** 进程内向量缓存：enterpriseId -> 切片向量列表 */
  private cache = new Map<number, Array<{ chunkId: number; docId: number; content: string; vec: number[] }>>();

  constructor(
    private readonly config: ConfigService,
    private readonly embedding: EmbeddingService,
    @InjectRepository(KbChunk) private readonly chunkRepo: Repository<KbChunk>,
  ) {
    this.driver = this.config.get('vector').driver;
  }

  async onModuleInit() {
    if (this.driver !== 'milvus') {
      this.logger.log('向量后端：memory（本地余弦检索，零外部依赖）');
      return;
    }
    try {
      // 动态加载，未安装 SDK 时自动回落，避免阻断启动
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { MilvusClient, DataType } = require('@zilliz/milvus2-sdk-node');
      const v = this.config.get('vector');
      this.milvus = new MilvusClient({ address: `${v.host}:${v.port}` });
      const has = await this.milvus.hasCollection({ collection_name: this.collection });
      if (!has.value) {
        await this.milvus.createCollection({
          collection_name: this.collection,
          fields: [
            { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: false },
            { name: 'enterprise_id', data_type: DataType.Int64 },
            { name: 'doc_id', data_type: DataType.Int64 },
            { name: 'vector', data_type: DataType.FloatVector, dim: v.dim },
          ],
        });
        await this.milvus.createIndex({
          collection_name: this.collection,
          field_name: 'vector',
          index_type: 'IVF_FLAT',
          metric_type: 'IP',
          params: { nlist: 128 },
        });
      }
      await this.milvus.loadCollection({ collection_name: this.collection });
      this.logger.log('向量后端：Milvus 已连接');
    } catch (e: any) {
      this.milvus = null;
      this.logger.warn(`Milvus 初始化失败(${e.message})，自动回落 memory 模式`);
    }
  }

  private get useMilvus() {
    return this.driver === 'milvus' && !!this.milvus;
  }

  /** 写入切片向量 */
  async upsert(
    enterpriseId: number,
    docId: number,
    items: Array<{ chunkId: number; content: string; vec: number[] }>,
  ) {
    if (this.useMilvus) {
      try {
        await this.milvus.insert({
          collection_name: this.collection,
          data: items.map((i) => ({
            id: i.chunkId,
            enterprise_id: enterpriseId,
            doc_id: docId,
            vector: i.vec,
          })),
        });
        await this.milvus.flush({ collection_names: [this.collection] });
      } catch (e: any) {
        this.logger.error(`Milvus 写入失败：${e.message}`);
      }
    }
    // memory 模式下向量已随 kb_chunk 落库，这里只需失效缓存
    this.cache.delete(enterpriseId);
  }

  /** 删除某文档的全部向量 */
  async deleteByDoc(enterpriseId: number, docId: number) {
    if (this.useMilvus) {
      try {
        await this.milvus.deleteEntities({
          collection_name: this.collection,
          expr: `enterprise_id == ${enterpriseId} && doc_id == ${docId}`,
        });
      } catch (e: any) {
        this.logger.error(`Milvus 删除失败：${e.message}`);
      }
    }
    this.cache.delete(enterpriseId);
  }

  /**
   * 语义检索
   * @param allowedDocIds 权限过滤后的可见文档ID；传空数组表示该用户无任何可见文档
   */
  async search(
    enterpriseId: number,
    query: string,
    topK = 3,
    allowedDocIds?: number[],
  ): Promise<SearchHit[]> {
    if (allowedDocIds && allowedDocIds.length === 0) return [];
    const qvec = await this.embedding.embed(query);

    if (this.useMilvus) {
      try {
        let expr = `enterprise_id == ${enterpriseId}`;
        if (allowedDocIds?.length) expr += ` && doc_id in [${allowedDocIds.join(',')}]`;
        const res = await this.milvus.search({
          collection_name: this.collection,
          vector: qvec,
          limit: topK,
          expr,
          output_fields: ['doc_id'],
        });
        const ids = (res.results || []).map((r: any) => Number(r.id));
        if (!ids.length) return [];
        const chunks = await this.chunkRepo.find({ where: { id: In(ids), enterpriseId } });
        const map = new Map(chunks.map((c) => [Number(c.id), c]));
        return (res.results || [])
          .map((r: any) => {
            const c = map.get(Number(r.id));
            return c
              ? { chunkId: Number(c.id), docId: Number(c.docId), content: c.content, score: Number(r.score) }
              : null;
          })
          .filter(Boolean) as SearchHit[];
      } catch (e: any) {
        this.logger.warn(`Milvus 检索失败(${e.message})，本次回落 memory 检索`);
      }
    }

    // ---- memory 检索 ----
    const pool = await this.loadEnterpriseVectors(enterpriseId);
    const allow = allowedDocIds ? new Set(allowedDocIds.map(Number)) : null;
    const scored: SearchHit[] = [];
    for (const item of pool) {
      if (allow && !allow.has(item.docId)) continue;
      const score = EmbeddingService.cosine(qvec, item.vec);
      if (score <= 0) continue;
      scored.push({ chunkId: item.chunkId, docId: item.docId, content: item.content, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** 加载并缓存某企业的全部切片向量 */
  private async loadEnterpriseVectors(enterpriseId: number) {
    const hit = this.cache.get(enterpriseId);
    if (hit) return hit;

    const rows = await this.chunkRepo.find({
      where: { enterpriseId },
      select: ['id', 'docId', 'content', 'embedding'],
    });
    const list = rows
      .map((r) => {
        let vec: number[] = [];
        try {
          vec = r.embedding ? JSON.parse(r.embedding) : [];
        } catch {
          vec = [];
        }
        return { chunkId: Number(r.id), docId: Number(r.docId), content: r.content, vec };
      })
      .filter((x) => x.vec.length > 0);

    this.cache.set(enterpriseId, list);
    return list;
  }

  /** 供知识库模块在文档变更后主动失效缓存 */
  invalidate(enterpriseId: number) {
    this.cache.delete(enterpriseId);
  }
}
