import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KbChatHistory, KbChunk, KbDocument, SysUser } from '../../entities';
import { LlmService } from '../../infra/llm/llm.service';
import { EmbeddingService } from '../../infra/vector/embedding.service';
import { VectorService } from '../../infra/vector/vector.service';
import { DocParserService } from '../../infra/parser/doc-parser.service';
import { Prompts } from '../../infra/llm/prompts';
import { LlmScene } from '../../infra/llm/mock-engine';

export interface RefDoc {
  doc_id: number;
  title: string;
  snippet: string;
  score: number;
}

/**
 * AI 中间层服务
 * 对应文档 1.1 «AI 中间层接口 /api/ai»
 *
 * 全平台唯一的 AI 出口：所有业务模块的 AI 能力都调用这里，
 * 好处是密钥、降级、审计、租户隔离只需要在一个地方保证。
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger('AiService');

  constructor(
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(KbChunk) private readonly chunkRepo: Repository<KbChunk>,
    @InjectRepository(KbChatHistory) private readonly chatRepo: Repository<KbChatHistory>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    private readonly llm: LlmService,
    private readonly embedding: EmbeddingService,
    private readonly vector: VectorService,
    private readonly parser: DocParserService,
  ) {}

  /**
   * 计算该用户可见的知识库文档ID集合
   * 对应 PRD 模块3-3：AI 问答时自动过滤无权限文档片段
   */
  async allowedDocIds(enterpriseId: number, userId: number): Promise<number[]> {
    const docs = await this.docRepo.find({
      where: { enterpriseId },
      select: { id: true, permScope: true, permTargets: true },
    });
    const user = await this.userRepo.findOne({ where: { id: userId, enterpriseId } });
    if (!user) return [];
    if (user.isSuper) return docs.map((d) => Number(d.id));

    const deptId = String(user.deptId || 0);
    const roleIds = (user.roleIds || '').split(',').map((s) => s.trim()).filter(Boolean);

    return docs
      .filter((d) => {
        const scope = d.permScope || 'all';
        if (scope === 'all') return true;
        const targets = (d.permTargets || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!targets.length) return false;
        if (scope === 'dept') return targets.includes(deptId);
        if (scope === 'role') return roleIds.some((r) => targets.includes(r));
        return false;
      })
      .map((d) => Number(d.id));
  }

  /**
   * POST /api/ai/chat
   * 企业 AI 对话，可开关知识库语义检索
   */
  async chat(dto: {
    enterpriseId: number;
    userId: number;
    query: string;
    history?: Array<{ role: string; content: string }>;
    enableKb?: boolean;
    topK?: number;
  }) {
    const query = (dto.query || '').trim();
    if (!query) throw new BadRequestException('请输入问题内容');

    const enableKb = dto.enableKb !== false;
    let refDocs: RefDoc[] = [];
    let refText = '';

    if (enableKb) {
      const hits = await this.search({
        enterpriseId: dto.enterpriseId,
        userId: dto.userId,
        query,
        topK: dto.topK || 3,
      });
      refDocs = hits;
      refText = hits
        .map((h, i) => `【资料${i + 1}｜${h.title}】\n${h.snippet}`)
        .join('\n\n');
    }

    const scene: LlmScene = enableKb && refDocs.length ? 'kb_qa' : 'chat';
    const prompt = scene === 'kb_qa' ? Prompts.kbQa(query, refText) : query;

    const res = await this.llm.complete({
      scene,
      enterpriseId: dto.enterpriseId,
      prompt,
      history: dto.history,
      payload: { question: query, refs: refDocs.map((r) => ({ title: r.title, snippet: r.snippet })) },
    });

    // 落会话历史，供后续追溯与训练语料沉淀
    await this.chatRepo
      .save(
        this.chatRepo.create({
          enterpriseId: dto.enterpriseId,
          userId: dto.userId,
          question: query,
          answer: res.content,
          refDocs: JSON.stringify(refDocs),
        }),
      )
      .catch(() => void 0);

    return {
      answer: res.content,
      ref_docs: refDocs.map((r) => ({ doc_id: r.doc_id, title: r.title, snippet: r.snippet })),
      provider: res.provider,
      fallback_reason: res.fallbackReason,
    };
  }

  /**
   * POST /api/ai/document/parse
   * 文档解析：pdf / word / excel / txt
   */
  async parseDocument(dto: { fileBase64: string; fileName: string }) {
    const fileName = dto.fileName || '';
    if (!fileName) throw new BadRequestException('缺少文件名');
    if (!DocParserService.isSupported(fileName)) {
      throw new BadRequestException(
        `暂不支持该格式，仅支持 ${DocParserService.SUPPORTED.join('、')}`,
      );
    }
    const b64 = (dto.fileBase64 || '').replace(/^data:.*?;base64,/, '');
    if (!b64) throw new BadRequestException('文件内容为空');
    const buf = Buffer.from(b64, 'base64');
    const content = await this.parser.parse(fileName, buf);
    return { content, length: content.length };
  }

  /**
   * POST /api/ai/document/embedding
   * 文档切片 + 向量化写入
   */
  async embedDocument(dto: { enterpriseId: number; docId: number; content: string }) {
    const content = (dto.content || '').trim();
    if (!content) throw new BadRequestException('文档内容为空，无法向量化');

    const doc = await this.docRepo.findOne({
      where: { id: dto.docId, enterpriseId: dto.enterpriseId },
    });
    if (!doc) throw new BadRequestException('文档不存在或不属于当前企业');

    // 重新向量化前先清空旧切片，避免脏数据累积
    await this.chunkRepo.delete({ enterpriseId: dto.enterpriseId, docId: dto.docId });
    await this.vector.deleteByDoc(dto.enterpriseId, dto.docId);

    const pieces = this.parser.chunk(content);
    if (!pieces.length) {
      await this.docRepo.update(dto.docId, { vectorStatus: 2, chunkCount: 0 });
      return { status: 2, msg: '未切分出有效内容', chunk_count: 0 };
    }

    try {
      const vecs = await this.embedding.embedBatch(pieces);
      const rows = pieces.map((c, i) =>
        this.chunkRepo.create({
          enterpriseId: dto.enterpriseId,
          docId: dto.docId,
          chunkIndex: i,
          content: c,
          embedding: JSON.stringify(vecs[i]),
        }),
      );
      const saved = await this.chunkRepo.save(rows);
      await this.vector.upsert(
        dto.enterpriseId,
        dto.docId,
        saved.map((s, i) => ({ chunkId: Number(s.id), content: s.content, vec: vecs[i] })),
      );
      await this.docRepo.update(dto.docId, { vectorStatus: 1, chunkCount: saved.length });
      return { status: 1, msg: '向量化完成', chunk_count: saved.length };
    } catch (e: any) {
      this.logger.error(`文档向量化失败 docId=${dto.docId}：${e.message}`);
      await this.docRepo.update(dto.docId, { vectorStatus: 2 });
      return { status: 2, msg: `向量化失败：${e.message}`, chunk_count: 0 };
    }
  }

  /**
   * POST /api/ai/search
   * 知识库语义检索，自动做权限过滤
   */
  async search(dto: {
    enterpriseId: number;
    userId: number;
    query: string;
    topK?: number;
  }): Promise<RefDoc[]> {
    const query = (dto.query || '').trim();
    if (!query) return [];

    const allowed = await this.allowedDocIds(dto.enterpriseId, dto.userId);
    if (!allowed.length) return [];

    const hits = await this.vector.search(dto.enterpriseId, query, dto.topK || 3, allowed);
    if (!hits.length) return [];

    const docs = await this.docRepo.find({
      where: hits.map((h) => ({ id: h.docId, enterpriseId: dto.enterpriseId })),
    });
    const titleMap = new Map(docs.map((d) => [Number(d.id), d.title]));

    return hits.map((h) => ({
      doc_id: h.docId,
      title: titleMap.get(h.docId) || '未知文档',
      snippet: h.content.length > 300 ? h.content.slice(0, 300) + '…' : h.content,
      score: Number(h.score.toFixed(4)),
    }));
  }

  /**
   * POST /api/ai/extract
   * 文本信息抽取（客户 / 订单 / 联系人）
   */
  async extract(dto: { enterpriseId: number; text: string }) {
    const text = (dto.text || '').trim();
    if (!text) throw new BadRequestException('请输入待抽取的文本');
    const fallback = {
      company_name: '',
      customer_name: '',
      phone: '',
      intention: '',
      remark: '',
    };
    const data = await this.llm.completeJson(
      {
        scene: 'extract',
        enterpriseId: dto.enterpriseId,
        prompt: Prompts.extract(text),
        payload: { text },
      },
      fallback,
    );
    return { ...fallback, ...data };
  }

  /**
   * POST /api/ai/generate
   * AI 内容生成：日报、话术、方案、制度
   */
  async generate(dto: {
    enterpriseId: number;
    prompt: string;
    context?: string;
    scene?: LlmScene;
  }) {
    const p = (dto.prompt || '').trim();
    if (!p) throw new BadRequestException('请输入生成要求');
    const full = dto.context ? `${p}\n\n【业务上下文数据】\n${dto.context}` : p;
    const res = await this.llm.complete({
      scene: dto.scene || 'chat',
      enterpriseId: dto.enterpriseId,
      prompt: full,
      payload: { question: p, context: dto.context },
    });
    return { content: res.content, provider: res.provider };
  }

  /**
   * POST /api/ai/classify
   * AI 分类打分：客户意向、风险识别
   */
  async classify(dto: {
    enterpriseId: number;
    bizType: string;
    context: string;
    /** 结构化特征：供未接大模型时的规则引擎精确打分，接了大模型则仅作参考 */
    features?: { followCount?: number; daysSinceLastFollow?: number; text?: string };
  }) {
    const bizType = dto.bizType || 'customer_intention';
    const ctx = (dto.context || '').trim();
    if (!ctx) throw new BadRequestException('请输入待分析的上下文');

    if (bizType === 'customer_intention') {
      const fallback = { score: 0, grade: 'C', reason: '' };
      const f = dto.features || {};
      const data = await this.llm.completeJson(
        {
          scene: 'customer_intention',
          enterpriseId: dto.enterpriseId,
          prompt: Prompts.customerIntention(ctx),
          payload: {
            context: ctx,
            followCount: f.followCount ?? 0,
            daysSinceLastFollow: f.daysSinceLastFollow ?? 999,
            text: f.text ?? ctx,
          },
        },
        fallback,
      );
      const score = Math.max(0, Math.min(100, Number(data.score) || 0));
      const grade = ['A', 'B', 'C', 'D'].includes(String(data.grade))
        ? String(data.grade)
        : score >= 80
          ? 'A'
          : score >= 60
            ? 'B'
            : score >= 30
              ? 'C'
              : 'D';
      return { biz_type: bizType, score, grade, reason: data.reason || '' };
    }

    // 风险识别等其他分类场景
    const res = await this.llm.complete({
      scene: 'risk_advice',
      enterpriseId: dto.enterpriseId,
      prompt: Prompts.riskAdvice(ctx),
      payload: { context: ctx },
    });
    return { biz_type: bizType, content: res.content, provider: res.provider };
  }

  /** 内部复用：给指定场景跑一次大模型并拿纯文本 */
  async run(scene: LlmScene, enterpriseId: number, prompt: string, payload?: any): Promise<string> {
    const res = await this.llm.complete({ scene, enterpriseId, prompt, payload });
    return res.content;
  }

  /** 会话历史 */
  async chatHistory(enterpriseId: number, userId: number, limit = 20) {
    const list = await this.chatRepo.find({
      where: { enterpriseId, userId },
      order: { id: 'DESC' },
      take: Math.min(100, limit),
    });
    return list.reverse().map((c) => ({
      id: Number(c.id),
      question: c.question,
      answer: c.answer,
      ref_docs: c.refDocs ? JSON.parse(c.refDocs) : [],
      created_at: c.createdAt,
    }));
  }
}
