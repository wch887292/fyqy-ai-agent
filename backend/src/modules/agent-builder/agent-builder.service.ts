import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AgentSimple, AgentAdvanced, AgentAdvancedNode, AgentExecRecord, KbDocument } from "../../entities";
import { AuthUser } from "../../common/auth";
import { snakePage, toSnake } from "../../common/result";
import { parsePage } from "../../common/scope";
import { parseIntId } from "../../common/id.util";
import { AiService, RefDoc } from "../ai/ai.service";

interface SimpleSaveDto {
  id?: number;
  agentType: string;
  agentName: string;
  avatar?: string;
  persona?: string;
  systemPrompt: string;
  kbDocIds?: string;
  answerStyle: string;
  temperature: number;
  maxTokens: number;
  showRefs: number;
  accessPwd?: string;
}

interface AdvancedSaveDto {
  id?: number;
  agentType: string;
  agentName: string;
  avatar?: string;
  description?: string;
  inputQuestions?: string;
  enableQOptimize: number;
  enableSafety: number;
  sensitiveWords?: string;
  kbDocIds?: string;
  nodes?: Array<{ node_type: string; node_name: string; node_config: string; sort_order: number }>;
}

@Injectable()
export class AgentBuilderService {
  private readonly logger = new Logger("AgentBuilderService");

  constructor(
    @InjectRepository(AgentSimple) private readonly simpleRepo: Repository<AgentSimple>,
    @InjectRepository(AgentAdvanced) private readonly advancedRepo: Repository<AgentAdvanced>,
    @InjectRepository(AgentAdvancedNode) private readonly nodeRepo: Repository<AgentAdvancedNode>,
    @InjectRepository(AgentExecRecord) private readonly recordRepo: Repository<AgentExecRecord>,
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    private readonly ai: AiService,
  ) {}

  async kbDocList(enterpriseId: number, keyword?: string) {
    const where: any = { enterpriseId };
    if (keyword) where.title = "%" + keyword + "%";
    return this.docRepo.find({ where, select: ["id", "title", "category", "createdAt"], order: { createdAt: "DESC" }, take: 100 });
  }

  async simplePage(query: any, user: AuthUser) {
    const { skip, take } = parsePage(query);
    const where: any = { enterpriseId: user.enterpriseId };
    const [list, total] = await this.simpleRepo.findAndCount({ where, skip, take, order: { createdAt: "DESC" } });
    return snakePage(list, total, query.page, query.size);
  }

  async simpleSave(dto: SimpleSaveDto, user: AuthUser) {
    const id = parseIntId(dto.id, "智能体ID", true);
    if (id > 0) {
      const existing = await this.simpleRepo.findOne({ where: { id, enterpriseId: user.enterpriseId } });
      if (!existing) throw new BadRequestException("智能体不存在或无权操作");
      await this.simpleRepo.save(this.simpleRepo.create({ ...dto, id, enterpriseId: user.enterpriseId, createdBy: user.userId, updatedAt: new Date() }));
    } else {
      const entity = this.simpleRepo.create({ ...dto, enterpriseId: user.enterpriseId, createdBy: user.userId });
      await this.simpleRepo.save(entity);
      return { id: entity.id };
    }
    return { id };
  }

  async simpleEnable(id: number, enable: number, user: AuthUser) {
    const entity = await this.simpleRepo.findOne({ where: { id, enterpriseId: user.enterpriseId } });
    if (!entity) throw new BadRequestException("智能体不存在");
    entity.enable = enable;
    await this.simpleRepo.save(entity);
    return { ok: true };
  }

  async simpleDelete(id: number, user: AuthUser) {
    const entity = await this.simpleRepo.findOne({ where: { id, enterpriseId: user.enterpriseId } });
    if (!entity) throw new BadRequestException("智能体不存在");
    await this.simpleRepo.remove(entity);
    await this.recordRepo.delete({ agentId: id, agentType: "simple", enterpriseId: user.enterpriseId });
    return { ok: true };
  }

  async advancedPage(query: any, user: AuthUser) {
    const { skip, take } = parsePage(query);
    const where: any = { enterpriseId: user.enterpriseId };
    const [list, total] = await this.advancedRepo.findAndCount({ where, skip, take, order: { createdAt: "DESC" } });
    return snakePage(list, total, query.page, query.size);
  }

  async advancedSave(dto: AdvancedSaveDto, user: AuthUser) {
    const id = parseIntId(dto.id, "智能体ID", true);
    if (id > 0) {
      const existing = await this.advancedRepo.findOne({ where: { id, enterpriseId: user.enterpriseId } });
      if (!existing) throw new BadRequestException("智能体不存在或无权操作");
      await this.advancedRepo.save(this.advancedRepo.create({ ...dto, id, enterpriseId: user.enterpriseId, updatedAt: new Date() }));
      await this.nodeRepo.delete({ flowId: id });
      if (dto.nodes?.length) {
        await this.nodeRepo.save(dto.nodes.map((n) => this.nodeRepo.create({ ...n, flowId: id, createdBy: user.userId })));
      }
    } else {
      const entity = this.advancedRepo.create({ ...dto, enterpriseId: user.enterpriseId, createdBy: user.userId });
      await this.advancedRepo.save(entity);
      const newId = entity.id;
      if (dto.nodes?.length) {
        await this.nodeRepo.save(dto.nodes.map((n) => this.nodeRepo.create({ ...n, flowId: newId, createdBy: user.userId })));
      }
      return { id: newId };
    }
    return { id };
  }

  async advancedEnable(id: number, enable: number, user: AuthUser) {
    const entity = await this.advancedRepo.findOne({ where: { id, enterpriseId: user.enterpriseId } });
    if (!entity) throw new BadRequestException("智能体不存在");
    entity.enable = enable;
    await this.advancedRepo.save(entity);
    return { ok: true };
  }

  async advancedDelete(id: number, user: AuthUser) {
    const entity = await this.advancedRepo.findOne({ where: { id, enterpriseId: user.enterpriseId } });
    if (!entity) throw new BadRequestException("智能体不存在");
    await this.nodeRepo.delete({ flowId: id });
    await this.advancedRepo.remove(entity);
    await this.recordRepo.delete({ agentId: id, agentType: "advanced", enterpriseId: user.enterpriseId });
    return { ok: true };
  }

  async advancedNodes(flowId: number, user: AuthUser) {
    const entity = await this.advancedRepo.findOne({ where: { id: flowId, enterpriseId: user.enterpriseId } });
    if (!entity) throw new BadRequestException("工作流不存在");
    return this.nodeRepo.find({ where: { flowId }, order: { sortOrder: "ASC" } });
  }

  async simpleChat(id: number, dto: { question: string; userId?: number; password?: string }, user: AuthUser) {
    const t0 = Date.now();
    const agent = await this.simpleRepo.findOne({ where: { id, enterpriseId: user.enterpriseId } });
    if (!agent) throw new BadRequestException("智能体不存在");
    if (agent.enable !== 1) throw new BadRequestException("智能体已禁用");
    if (agent.accessPwd && agent.accessPwd !== dto.password) throw new BadRequestException("需要访问密码");

    const docIds = (agent.kbDocIds || "").split(",").map((s) => parseInt(s.trim())).filter(Boolean);
    let answer = "";
    let refs: RefDoc[] = [];

    if (docIds.length > 0) {
      const hits = await this.ai.search({ enterpriseId: user.enterpriseId, userId: user.userId, query: dto.question, topK: 3 });
      refs = hits.filter((h) => docIds.includes(h.doc_id));
      const refText = refs.map((h, i) => "【资料" + (i + 1) + "｜" + h.title + "】\n" + h.snippet).join("\n\n");
      const prompt = agent.systemPrompt + (refText ? "\n\n请根据以下资料回答：\n" + refText : "");
      answer = await this.ai.run(refs.length ? "kb_qa" : "chat", user.enterpriseId, prompt, { question: dto.question });
    } else {
      answer = await this.ai.run("chat", user.enterpriseId, agent.systemPrompt + "\n\n" + dto.question, { question: dto.question });
    }

    const costMs = Date.now() - t0;
    await this.recordRepo.save(this.recordRepo.create({
      enterpriseId: user.enterpriseId, agentId: id, agentType: "simple",
      question: dto.question, answer,
      refs: refs.length ? JSON.stringify(refs.map((r) => ({ title: r.title, snippet: r.snippet.slice(0, 200) }))) : null,
      costMs, execStatus: "success", createdBy: user.userId,
    }));
    return { code: 0, data: { answer, costMs, refs: refs.map((r) => ({ title: r.title, snippet: r.snippet.slice(0, 200) })) } };
  }

  async advancedChat(id: number, dto: { question: string; userId?: number }, user: AuthUser) {
    const t0 = Date.now();
    const agent = await this.advancedRepo.findOne({ where: { id, enterpriseId: user.enterpriseId }, relations: ["nodes"] });
    if (!agent) throw new BadRequestException("智能体不存在");
    if (agent.enable !== 1) throw new BadRequestException("智能体已禁用");

    let question = dto.question;
    const refs: any[] = [];

    if (agent.enableSafety === 1 && agent.sensitiveWords) {
      const words = agent.sensitiveWords.split(",").map((s) => s.trim()).filter(Boolean);
      const hit = words.find((w) => question.includes(w));
      if (hit) {
        await this._saveRecord(agent, dto, user, "敏感词拦截", t0);
        return { code: 0, data: { answer: "您的提问包含敏感内容，请重新表述。", costMs: Date.now() - t0, refs: [] } };
      }
    }

    if (agent.enableQOptimize === 1) {
      const optimized = await this._optimizeQuestion(question, user);
      if (optimized) question = optimized;
    }

    const docIds = (agent.kbDocIds || "").split(",").map((s) => parseInt(s.trim())).filter(Boolean);
    if (docIds.length > 0) {
      const hits = await this.ai.search({ enterpriseId: user.enterpriseId, userId: user.userId, query: question, topK: 3 });
      refs.push(...hits.filter((h: any) => docIds.includes(h.doc_id)).map((h: any) => ({ title: h.title, snippet: h.snippet.slice(0, 200) })));
    }

    const refCtx = refs.length ? "\n\n参考资料：\n" + refs.map((r, i) => "【" + (i + 1) + "｜" + r.title + "】" + r.snippet).join("\n\n") : "";
    const sysCtx = agent.description ? "\n上下文中：" + agent.description : "";
    const answer = await this.ai.run(refs.length ? "kb_qa" : "chat", user.enterpriseId, question + refCtx + sysCtx, { question });
    const costMs = Date.now() - t0;
    await this._saveRecord(agent, dto, user, answer, t0, refs);
    return { code: 0, data: { answer, costMs, refs } };
  }

  private async _saveRecord(agent: any, dto: any, user: AuthUser, answer: string, t0: number, refs: any[] = []) {
    await this.recordRepo.save(this.recordRepo.create({
      enterpriseId: user.enterpriseId, agentId: agent.id, agentType: "advanced",
      question: dto.question, answer,
      refs: refs.length ? JSON.stringify(refs) : null,
      costMs: Date.now() - t0, execStatus: "success", createdBy: user.userId,
    }));
  }

  private async _optimizeQuestion(question: string, user: AuthUser): Promise<string | null> {
    try {
      const optimized = (await this.ai.run("chat", user.enterpriseId, "请对以下用户问题进行意图识别和语义补全，只输出优化后的问题，不要解释。原始问题：" + question, { question })).trim();
      return optimized && optimized !== question ? optimized : null;
    } catch {
      return null;
    }
  }

  async recordPage(query: any, user: AuthUser) {
    const { skip, take } = parsePage(query);
    const where: any = { enterpriseId: user.enterpriseId };
    if (query.agentId) where.agentId = parseInt(query.agentId);
    if (query.agentType) where.agentType = query.agentType;
    const [list, total] = await this.recordRepo.findAndCount({ where, skip, take, order: { createdAt: "DESC" } });
    return snakePage(list, total, query.page, query.size);
  }
}
