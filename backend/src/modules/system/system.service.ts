import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import axios from 'axios';
import { Enterprise, SysConfig, SysOperLog, SysUser } from '../../entities';
import { pageResult } from '../../common/result';
import { parsePage } from '../../common/scope';
import { AuthUser } from '../../common/auth';
import { LlmService } from '../../infra/llm/llm.service';

/** 大模型配置在 sys_config 中的固定 key */
const AI_KEYS = {
  endpoint: 'ai_endpoint',
  key: 'ai_key',
  model: 'ai_model',
} as const;

/** 允许企业自助配置的业务参数白名单，防止乱写脏 key */
const BIZ_CONFIG_KEYS = [
  'kb_chunk_size', // 知识库切片长度
  'kb_top_k', // 知识库检索条数
  'crm_follow_overdue_days', // 跟进逾期天数
  'erp_default_warn_stock', // 默认库存预警线
  'workbench_notice', // 工作台公告
];

/**
 * 系统设置服务
 * 对应文档 1.7 章节：OpenClaw 大模型配置、企业参数、操作日志
 *
 * 安全约束：api_key 出参一律掩码，绝不明文回传前端
 */
@Injectable()
export class SystemService {
  private readonly logger = new Logger('SystemService');

  constructor(
    @InjectRepository(SysConfig) private readonly cfgRepo: Repository<SysConfig>,
    @InjectRepository(SysOperLog) private readonly logRepo: Repository<SysOperLog>,
    @InjectRepository(Enterprise) private readonly entRepo: Repository<Enterprise>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  /** 密钥掩码：只留首尾各 4 位 */
  private mask(v: string): string {
    if (!v) return '';
    if (v.length <= 8) return '********';
    return v.slice(0, 4) + '****' + v.slice(-4);
  }

  private async putConfig(entId: number, key: string, value: string, remark = '') {
    let row = await this.cfgRepo.findOne({ where: { enterpriseId: entId, configKey: key } });
    if (row) {
      row.configValue = value;
      if (remark) row.remark = remark;
    } else {
      row = this.cfgRepo.create({
        enterpriseId: entId,
        configKey: key,
        configValue: value,
        remark,
      });
    }
    await this.cfgRepo.save(row);
  }

  private async readConfig(entId: number, key: string): Promise<string> {
    const row = await this.cfgRepo.findOne({ where: { enterpriseId: entId, configKey: key } });
    return row?.configValue ?? '';
  }

  // ==================== 大模型配置 ====================

  /**
   * POST /api/v1/system/ai_config/save
   * 参数：api_endpoint、api_key、model_name
   */
  async saveAiConfig(entId: number, dto: any) {
    const endpoint = String(dto.api_endpoint ?? dto.apiEndpoint ?? '').trim();
    const model = String(dto.model_name ?? dto.modelName ?? '').trim();
    const rawKey = String(dto.api_key ?? dto.apiKey ?? '').trim();

    if (endpoint && !/^https?:\/\//i.test(endpoint)) {
      throw new BadRequestException('接口地址必须以 http:// 或 https:// 开头');
    }

    await this.putConfig(entId, AI_KEYS.endpoint, endpoint, 'OpenClaw 接口地址');
    await this.putConfig(entId, AI_KEYS.model, model, '大模型名称');

    // 前端回显的是掩码值，收到掩码说明用户没改密钥，保持原值不覆盖
    if (rawKey && !rawKey.includes('****')) {
      await this.putConfig(entId, AI_KEYS.key, rawKey, 'OpenClaw 密钥');
    }

    // 立即失效缓存，配置改完下一次调用即生效
    this.llm.clearCache(entId);

    const ready = await this.llm.isLlmReady(entId);
    return {
      saved: true,
      llm_ready: ready,
      tip: ready
        ? '大模型配置已生效，AI 能力将走 OpenClaw 私有化模型'
        : '未配置接口地址，AI 能力自动降级为内置规则引擎，业务不中断',
    };
  }

  /** GET /api/v1/system/ai_config/get */
  async getAiConfig(entId: number) {
    const endpoint = await this.readConfig(entId, AI_KEYS.endpoint);
    const key = await this.readConfig(entId, AI_KEYS.key);
    const model = await this.readConfig(entId, AI_KEYS.model);
    const envLlm = this.config.get('llm');

    return {
      api_endpoint: endpoint,
      api_key: this.mask(key),
      api_key_set: !!key,
      model_name: model,
      // 企业未配置时实际生效的兜底值，方便管理员判断当前跑的是什么
      effective_endpoint: endpoint || envLlm.endpoint || '',
      effective_model: model || envLlm.model || '',
      llm_ready: !!(endpoint || envLlm.endpoint),
      embedding_model: envLlm.embeddingModel || '内置中文本地向量',
      fallback_tip: '未配置或调用失败时，系统自动降级为内置规则引擎，保证 AI 功能可演示、业务不中断',
    };
  }

  /** POST /api/v1/system/ai_config/test 连通性测试 */
  async testAiConfig(entId: number, dto: any = {}) {
    const cfg = await this.llm.getEntConfig(entId);
    const endpoint = String(dto.api_endpoint ?? dto.apiEndpoint ?? cfg.endpoint ?? '').trim();
    const rawKey = String(dto.api_key ?? dto.apiKey ?? '').trim();
    const apiKey = rawKey && !rawKey.includes('****') ? rawKey : cfg.apiKey;
    const model = String(dto.model_name ?? dto.modelName ?? cfg.model ?? '').trim();

    if (!endpoint) {
      return {
        success: false,
        provider: 'mock',
        message: '尚未配置 OpenClaw 接口地址，当前由内置规则引擎提供 AI 能力',
      };
    }

    const started = Date.now();
    try {
      const url = endpoint.replace(/\/+$/, '') + '/chat/completions';
      const resp = await axios.post(
        url,
        {
          model,
          messages: [{ role: 'user', content: '你好，请回复"连接正常"四个字。' }],
          temperature: 0,
          stream: false,
        },
        {
          timeout: Math.min(this.config.get('llm').timeout, 20000),
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
        },
      );
      const content =
        resp.data?.choices?.[0]?.message?.content ?? resp.data?.content ?? '';
      return {
        success: true,
        provider: 'openclaw',
        cost_ms: Date.now() - started,
        reply: String(content).slice(0, 100),
        message: '大模型连接正常',
      };
    } catch (e: any) {
      const msg = e?.code === 'ECONNABORTED' ? '连接超时' : e?.message || '连接失败';
      this.logger.warn(`[企业${entId}] 大模型连通性测试失败：${msg}`);
      return {
        success: false,
        provider: 'mock',
        cost_ms: Date.now() - started,
        message: `连接失败：${msg}。系统将自动降级为内置规则引擎`,
      };
    }
  }

  // ==================== 企业业务参数 ====================

  /** POST /api/v1/system/config/save 批量保存业务参数 */
  async saveConfig(entId: number, dto: any) {
    const items: Array<{ key: string; value: string }> = [];
    if (Array.isArray(dto.items)) {
      for (const it of dto.items) {
        items.push({ key: String(it.config_key ?? it.key), value: String(it.config_value ?? it.value ?? '') });
      }
    } else {
      for (const k of Object.keys(dto)) {
        if (BIZ_CONFIG_KEYS.includes(k)) items.push({ key: k, value: String(dto[k] ?? '') });
      }
    }
    const invalid = items.filter((i) => !BIZ_CONFIG_KEYS.includes(i.key));
    if (invalid.length) {
      throw new BadRequestException(`不支持的配置项：${invalid.map((i) => i.key).join('、')}`);
    }
    if (!items.length) throw new BadRequestException('没有需要保存的配置项');

    for (const i of items) await this.putConfig(entId, i.key, i.value);
    return { saved: items.length };
  }

  /** GET /api/v1/system/config/get 读取业务参数 */
  async getConfig(entId: number) {
    const rows = await this.cfgRepo.find({ where: { enterpriseId: entId } });
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (BIZ_CONFIG_KEYS.includes(r.configKey)) map[r.configKey] = r.configValue;
    }
    const biz = this.config.get('biz');
    return {
      kb_chunk_size: map.kb_chunk_size || '800',
      kb_top_k: map.kb_top_k || '5',
      crm_follow_overdue_days: map.crm_follow_overdue_days || String(biz.followOverdueDays),
      erp_default_warn_stock: map.erp_default_warn_stock || '10',
      workbench_notice: map.workbench_notice || '',
      editable_keys: BIZ_CONFIG_KEYS,
    };
  }

  // ==================== 操作日志 ====================

  /** GET /api/v1/system/log/page 操作日志分页 */
  async logPage(entId: number, user: AuthUser, query: any) {
    const { page, size, skip, take } = parsePage(query, 20);
    const qb = this.logRepo
      .createQueryBuilder('l')
      .where('l.enterpriseId = :entId', { entId })
      .orderBy('l.id', 'DESC')
      .skip(skip)
      .take(take);

    if (query.module) qb.andWhere('l.module = :m', { m: query.module });
    if (query.username) qb.andWhere('l.username LIKE :u', { u: `%${query.username}%` });
    if (query.success !== undefined && query.success !== '') {
      qb.andWhere('l.success = :s', { s: Number(query.success) });
    }
    if (query.start_date && query.end_date) {
      qb.andWhere('l.createdAt BETWEEN :s AND :e', {
        s: new Date(query.start_date + 'T00:00:00'),
        e: new Date(query.end_date + 'T23:59:59'),
      });
    }
    // 非管理员只能看自己的操作痕迹
    if (!user.isSuper && user.dataScope < 3) {
      qb.andWhere('l.userId = :self', { self: user.userId });
    }

    const [list, total] = await qb.getManyAndCount();
    return pageResult(
      list.map((l) => ({
        id: Number(l.id),
        username: l.username,
        module: l.module,
        action: l.action,
        method: l.method,
        url: l.url,
        ip: l.ip,
        params: l.params,
        success: l.success,
        error_msg: l.errorMsg,
        cost_ms: l.costMs,
        created_at: l.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  /** POST /api/v1/system/log/clean 清理历史日志 */
  async cleanLog(entId: number, days: number) {
    const d = Math.max(7, Number(days) || 90);
    const before = new Date(Date.now() - d * 86400000);
    const res = await this.logRepo.delete({ enterpriseId: entId, createdAt: LessThan(before) });
    return { deleted: res.affected || 0, keep_days: d };
  }

  /** GET /api/v1/system/log/stat 近 7 日操作量 */
  async logStat(entId: number) {
    const days: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const base = new Date(Date.now() - i * 86400000);
      const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0);
      const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59);
      const count = await this.logRepo.count({
        where: { enterpriseId: entId, createdAt: Between(start, end) },
      });
      const p = (n: number) => String(n).padStart(2, '0');
      days.push({ date: `${base.getMonth() + 1}-${p(base.getDate())}`, count });
    }
    const failCount = await this.logRepo.count({ where: { enterpriseId: entId, success: 0 } });
    return { trend: days, fail_total: failCount };
  }

  // ==================== 运行环境信息 ====================

  /** GET /api/v1/system/info 系统运行信息（运维排查用） */
  async info(entId: number) {
    const db = this.config.get('db');
    const vector = this.config.get('vector');
    const storage = this.config.get('storage');
    const ent = await this.entRepo.findOne({ where: { id: entId } });
    const userCount = await this.userRepo.count({ where: { enterpriseId: entId } });

    return {
      app_name: this.config.get('appName'),
      version: 'V1.0.0',
      vendor: '晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心',
      mode: this.config.get('mode'),
      mode_text: this.config.get('mode') === 'prod' ? '生产模式（Docker 私有化）' : '开发模式（本地轻量）',
      db_driver: db.driver,
      vector_driver: vector.driver,
      vector_dim: vector.dim,
      storage_driver: storage.driver,
      llm_ready: await this.llm.isLlmReady(entId),
      enterprise: ent ? { id: Number(ent.id), name: ent.name, industry: ent.industry } : null,
      user_count: userCount,
      node_version: process.version,
      uptime_seconds: Math.floor(process.uptime()),
    };
  }
}
