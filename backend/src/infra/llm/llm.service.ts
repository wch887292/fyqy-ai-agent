import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { SysConfig } from '../../entities';
import { MockEngine, LlmScene } from './mock-engine';

export interface LlmCallOptions {
  /** 业务场景，决定降级引擎的生成策略 */
  scene: LlmScene;
  /** 企业ID，用于读取该企业自己的 OpenClaw 配置 */
  enterpriseId: number;
  /** 发给大模型的完整 prompt */
  prompt: string;
  /** 结构化业务数据，供降级引擎使用 */
  payload?: any;
  /** 多轮对话历史 */
  history?: Array<{ role: string; content: string }>;
  temperature?: number;
}

export interface LlmResult {
  content: string;
  /** 本次由谁生成：openclaw 真实大模型 / mock 规则引擎 */
  provider: 'openclaw' | 'mock';
  /** 降级原因，便于运维排查 */
  fallbackReason?: string;
}

/** 企业级 AI 配置 */
interface EntAiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

/**
 * 大模型统一调用服务（AI 中间层内核）
 *
 * 业务模块一律不得直接调用大模型，必须经由本服务，以保证：
 *   1. 企业级密钥隔离（每个租户用自己的 OpenClaw 配置）
 *   2. 统一降级，模型不可用时业务不中断
 *   3. 调用集中审计
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger('LlmService');
  /** 企业配置缓存，避免每次调用都查库 */
  private cache = new Map<number, { cfg: EntAiConfig; at: number }>();
  private readonly CACHE_TTL = 60_000;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SysConfig) private readonly cfgRepo: Repository<SysConfig>,
  ) {}

  /** 让配置修改立即生效 */
  clearCache(enterpriseId?: number) {
    if (enterpriseId) this.cache.delete(enterpriseId);
    else this.cache.clear();
  }

  /** 读取企业级 AI 配置，企业未配置则回落到环境变量 */
  async getEntConfig(enterpriseId: number): Promise<EntAiConfig> {
    const hit = this.cache.get(enterpriseId);
    if (hit && Date.now() - hit.at < this.CACHE_TTL) return hit.cfg;

    const envLlm = this.config.get('llm');
    const cfg: EntAiConfig = {
      endpoint: envLlm.endpoint,
      apiKey: envLlm.apiKey,
      model: envLlm.model,
    };

    try {
      const rows = await this.cfgRepo.find({ where: { enterpriseId } });
      for (const r of rows) {
        if (r.configKey === 'ai_endpoint' && r.configValue) cfg.endpoint = r.configValue;
        if (r.configKey === 'ai_key' && r.configValue) cfg.apiKey = r.configValue;
        if (r.configKey === 'ai_model' && r.configValue) cfg.model = r.configValue;
      }
    } catch {
      /* 表未就绪时忽略，用环境变量兜底 */
    }

    this.cache.set(enterpriseId, { cfg, at: Date.now() });
    return cfg;
  }

  /** 当前企业是否已具备真实大模型能力 */
  async isLlmReady(enterpriseId: number): Promise<boolean> {
    const cfg = await this.getEntConfig(enterpriseId);
    return !!cfg.endpoint;
  }

  /** 核心调用入口 */
  async complete(opts: LlmCallOptions): Promise<LlmResult> {
    const cfg = await this.getEntConfig(opts.enterpriseId);

    if (!cfg.endpoint) {
      return {
        content: MockEngine.run(opts.scene, opts.payload),
        provider: 'mock',
        fallbackReason: '未配置 OpenClaw 接口地址',
      };
    }

    try {
      const messages = [
        { role: 'system', content: '你是企业专属AI助手，回答简洁务实，使用简体中文。' },
        ...(opts.history || []).slice(-6),
        { role: 'user', content: opts.prompt },
      ];

      const url = cfg.endpoint.replace(/\/+$/, '') + '/chat/completions';
      const resp = await axios.post(
        url,
        {
          model: cfg.model,
          messages,
          temperature: opts.temperature ?? 0.6,
          stream: false,
        },
        {
          timeout: this.config.get('llm').timeout,
          headers: {
            'Content-Type': 'application/json',
            ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
          },
        },
      );

      const content =
        resp.data?.choices?.[0]?.message?.content ??
        resp.data?.data?.content ??
        resp.data?.content ??
        '';

      if (!content) throw new Error('大模型返回内容为空');
      return { content: String(content).trim(), provider: 'openclaw' };
    } catch (e: any) {
      const reason = e?.code === 'ECONNABORTED' ? '大模型响应超时' : e?.message || '大模型调用失败';
      this.logger.warn(`[企业${opts.enterpriseId}] ${reason}，已降级为规则引擎`);
      return {
        content: MockEngine.run(opts.scene, opts.payload),
        provider: 'mock',
        fallbackReason: reason,
      };
    }
  }

  /** 要求大模型返回 JSON 的场景，做容错解析 */
  async completeJson<T = any>(opts: LlmCallOptions, fallback: T): Promise<T> {
    const r = await this.complete(opts);
    return this.parseJson<T>(r.content, fallback);
  }

  parseJson<T>(text: string, fallback: T): T {
    if (!text) return fallback;
    try {
      return JSON.parse(text) as T;
    } catch {
      /* 继续尝试从围栏中提取 */
    }
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        return JSON.parse(fence[1]) as T;
      } catch {
        /* ignore */
      }
    }
    const braced = text.match(/\{[\s\S]*\}/);
    if (braced) {
      try {
        return JSON.parse(braced[0]) as T;
      } catch {
        /* ignore */
      }
    }
    return fallback;
  }
}
