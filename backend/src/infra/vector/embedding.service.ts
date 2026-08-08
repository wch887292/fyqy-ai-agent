import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * 文本向量化服务
 *
 * 双通道：
 *   1. 配置了 EMBEDDING_API_ENDPOINT -> 调用远程 embedding 模型（推荐生产使用）
 *   2. 未配置 -> 使用内置轻量算法：中文 bi-gram + 特征哈希 + TF 加权 + L2 归一化
 *
 * 内置算法说明：
 *   对中文短文本（制度条款、话术、产品参数）的语义近似检索效果可用，
 *   且零依赖、零网络、毫秒级，适合本地演示与中小企业单机私有化部署。
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger('Embedding');
  private readonly dim: number;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.dim = this.config.get('vector').dim;
    const llm = this.config.get('llm');
    this.endpoint = llm.embeddingEndpoint;
    this.model = llm.embeddingModel;
    this.apiKey = llm.apiKey;
  }

  /** 批量向量化 */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    if (this.endpoint) {
      try {
        const url = this.endpoint.replace(/\/+$/, '') + '/embeddings';
        const resp = await axios.post(
          url,
          { model: this.model, input: texts },
          {
            timeout: 30000,
            headers: {
              'Content-Type': 'application/json',
              ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
            },
          },
        );
        const arr = resp.data?.data;
        if (Array.isArray(arr) && arr.length === texts.length) {
          return arr.map((x: any) => this.l2(x.embedding));
        }
        throw new Error('embedding 返回结构异常');
      } catch (e: any) {
        this.logger.warn(`远程 embedding 调用失败(${e.message})，降级为内置算法`);
      }
    }
    return texts.map((t) => this.localEmbed(t));
  }

  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedBatch([text]);
    return v;
  }

  /**
   * 内置轻量向量算法
   * 中文按 bi-gram 切分，英文数字按词切分，特征哈希映射到固定维度
   */
  localEmbed(text: string): number[] {
    const vec = new Array(this.dim).fill(0);
    const tokens = this.tokenize(text);
    if (!tokens.length) return vec;

    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

    for (const [token, count] of tf) {
      // 次线性 TF 抑制高频词主导
      const weight = 1 + Math.log(count);
      // 双哈希降低冲突影响
      const h1 = this.hash(token, 1) % this.dim;
      const h2 = this.hash(token, 2) % this.dim;
      const sign = this.hash(token, 3) % 2 === 0 ? 1 : -1;
      vec[h1] += weight * sign;
      vec[h2] += weight * sign * 0.5;
    }
    return this.l2(vec);
  }

  private tokenize(text: string): string[] {
    const out: string[] = [];
    const clean = (text || '').toLowerCase().replace(/\s+/g, ' ');
    // 中文连续片段 -> bi-gram + uni-gram
    const cnSegs = clean.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const seg of cnSegs) {
      for (let i = 0; i < seg.length; i++) {
        out.push(seg[i]);
        if (i + 2 <= seg.length) out.push(seg.slice(i, i + 2));
      }
    }
    // 英文/数字 -> 整词
    const enSegs = clean.match(/[a-z0-9]{2,}/g) || [];
    out.push(...enSegs);
    return out;
  }

  /** FNV-1a 变体哈希 */
  private hash(str: string, salt: number): number {
    let h = 2166136261 ^ (salt * 16777619);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  private l2(vec: number[]): number[] {
    let sum = 0;
    for (const v of vec) sum += v * v;
    const norm = Math.sqrt(sum);
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }

  /** 余弦相似度（向量已归一化，等价于点积） */
  static cosine(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }
}
