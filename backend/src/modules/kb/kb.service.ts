import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KB_CATEGORIES, KbChunk, KbDocument, SysUser } from '../../entities';
import { pageResult } from '../../common/result';
import { parsePage } from '../../common/scope';
import { AuthUser } from '../../common/auth';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../../infra/storage/storage.service';
import { DocParserService } from '../../infra/parser/doc-parser.service';
import { LlmService } from '../../infra/llm/llm.service';
import { VectorService } from '../../infra/vector/vector.service';
import { Prompts } from '../../infra/llm/prompts';

@Injectable()
export class KbService {
  private readonly logger = new Logger('KbService');

  constructor(
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(KbChunk) private readonly chunkRepo: Repository<KbChunk>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    private readonly ai: AiService,
    private readonly storage: StorageService,
    private readonly parser: DocParserService,
    private readonly llm: LlmService,
    private readonly vector: VectorService,
  ) {}

  /** GET /api/v1/kb/category/list 分类枚举 */
  async categoryList(entId: number) {
    const rows = await this.docRepo
      .createQueryBuilder('d')
      .select('d.category', 'category')
      .addSelect('COUNT(1)', 'cnt')
      .where('d.enterpriseId = :entId', { entId })
      .groupBy('d.category')
      .getRawMany();
    const map = new Map(rows.map((r) => [r.category, Number(r.cnt)]));
    return KB_CATEGORIES.map((c) => ({ ...c, count: map.get(c.code) || 0 }));
  }

  /**
   * POST /api/v1/kb/doc/upload 上传文档
   * 完整链路：解析 -> 落存储 -> 建档 -> AI打标签摘要 -> 切片向量化
   */
  async upload(entId: number, user: AuthUser, dto: any) {
    const fileName: string = dto.file_name ?? dto.fileName ?? '';
    const b64: string = (dto.file_base64 ?? dto.fileBase64 ?? '').replace(/^data:.*?;base64,/, '');
    const category: string = dto.category || 'system';

    if (!KB_CATEGORIES.some((c) => c.code === category)) {
      throw new BadRequestException('文档分类不合法');
    }
    if (!fileName) throw new BadRequestException('缺少文件名');
    if (!b64) throw new BadRequestException('文件内容为空');
    if (!DocParserService.isSupported(fileName)) {
      throw new BadRequestException(
        `暂不支持该格式，仅支持 ${DocParserService.SUPPORTED.join('、')}`,
      );
    }

    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 50 * 1024 * 1024) throw new BadRequestException('单个文件不能超过 50MB');

    // 1. 解析文本
    const content = await this.parser.parse(fileName, buf);
    if (!content.trim()) throw new BadRequestException('文档内容为空或无法解析出文字');

    // 2. 落存储
    const filePath = await this.storage.save(entId, fileName, buf);

    // 3. 建档
    const title = (dto.title || fileName.replace(/\.[^.]+$/, '')).trim();
    let doc = await this.docRepo.save(
      this.docRepo.create({
        enterpriseId: entId,
        category,
        title,
        fileName,
        filePath,
        fileSize: buf.length,
        content,
        tagList: dto.tag_list ?? dto.tagList ?? '',
        permScope: dto.perm_scope ?? dto.permScope ?? 'all',
        permTargets: Array.isArray(dto.perm_targets ?? dto.permTargets)
          ? (dto.perm_targets ?? dto.permTargets).join(',')
          : (dto.perm_targets ?? dto.permTargets ?? ''),
        vectorStatus: 0,
        chunkCount: 0,
        createdBy: user.userId,
      }),
    );

    // 4. AI 打标签 + 摘要（失败不影响主流程）
    try {
      const ai = await this.llm.completeJson(
        {
          scene: 'doc_tag',
          enterpriseId: entId,
          prompt: Prompts.docTag(title, content.slice(0, 3000)),
          payload: { title, content },
        },
        { tags: [] as string[], summary: '' },
      );
      const tags = Array.isArray(ai.tags) ? ai.tags.filter(Boolean).slice(0, 8) : [];
      const manual = (doc.tagList || '').split(',').filter(Boolean);
      const merged = [...new Set([...manual, ...tags])].join(',');
      doc.tagList = merged;
      doc.summary = ai.summary || content.slice(0, 200);
      await this.docRepo.update(doc.id, { tagList: merged, summary: doc.summary });
    } catch (e: any) {
      this.logger.warn(`文档 AI 标签生成失败：${e.message}`);
    }

    // 5. 向量化
    const vec = await this.ai.embedDocument({
      enterpriseId: entId,
      docId: Number(doc.id),
      content,
    });

    doc = await this.docRepo.findOne({ where: { id: doc.id } });
    return {
      doc_id: Number(doc.id),
      title: doc.title,
      category: doc.category,
      tag_list: (doc.tagList || '').split(',').filter(Boolean),
      summary: doc.summary,
      file_size: doc.fileSize,
      vector_status: doc.vectorStatus,
      chunk_count: doc.chunkCount,
      embedding_msg: vec.msg,
    };
  }

  /** GET /api/v1/kb/doc/page 文档分页 */
  async page(entId: number, user: AuthUser, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.enterpriseId = :entId', { entId })
      .orderBy('d.id', 'DESC')
      .skip(skip)
      .take(take);

    if (query.category) qb.andWhere('d.category = :cat', { cat: query.category });
    if (query.keyword) {
      qb.andWhere('(d.title LIKE :kw OR d.tagList LIKE :kw OR d.summary LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    if (query.vector_status !== undefined && query.vector_status !== '') {
      qb.andWhere('d.vectorStatus = :vs', { vs: Number(query.vector_status) });
    }

    // 非管理员只看有权限的文档
    if (!user.isSuper && user.dataScope < 3) {
      const allowed = await this.ai.allowedDocIds(entId, user.userId);
      if (!allowed.length) return pageResult([], 0, page, size);
      qb.andWhere('d.id IN (:...allowed)', { allowed });
    }

    const [list, total] = await qb.getManyAndCount();
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    const uMap = new Map(users.map((u) => [Number(u.id), u.realName || u.username]));
    const catMap = new Map<string, string>(KB_CATEGORIES.map((c) => [c.code as string, c.name as string]));

    return pageResult(
      list.map((d) => ({
        id: Number(d.id),
        category: d.category,
        category_name: catMap.get(d.category) || d.category,
        title: d.title,
        file_name: d.fileName,
        file_size: Number(d.fileSize || 0),
        summary: d.summary,
        tag_list: (d.tagList || '').split(',').filter(Boolean),
        perm_scope: d.permScope,
        perm_targets: (d.permTargets || '').split(',').filter(Boolean),
        vector_status: d.vectorStatus,
        vector_status_text: ['待向量化', '已完成', '失败'][d.vectorStatus] || '待向量化',
        chunk_count: d.chunkCount,
        created_by: Number(d.createdBy || 0),
        created_by_name: uMap.get(Number(d.createdBy)) || '',
        created_at: d.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  /** 文档详情（含正文，用于在线预览） */
  async detail(entId: number, user: AuthUser, id: number) {
    const doc = await this.docRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!doc) throw new NotFoundException('文档不存在');
    if (!user.isSuper) {
      const allowed = await this.ai.allowedDocIds(entId, user.userId);
      if (!allowed.includes(Number(id))) throw new BadRequestException('您无权查看该文档');
    }
    return {
      id: Number(doc.id),
      category: doc.category,
      title: doc.title,
      file_name: doc.fileName,
      file_size: Number(doc.fileSize || 0),
      summary: doc.summary,
      tag_list: (doc.tagList || '').split(',').filter(Boolean),
      perm_scope: doc.permScope,
      perm_targets: (doc.permTargets || '').split(',').filter(Boolean),
      vector_status: doc.vectorStatus,
      chunk_count: doc.chunkCount,
      content: doc.content,
      created_at: doc.createdAt,
    };
  }

  /** PUT /api/v1/kb/doc/update 文档修改 */
  async update(entId: number, dto: any) {
    const id = Number(dto.id ?? dto.doc_id ?? dto.docId);
    const doc = await this.docRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!doc) throw new NotFoundException('文档不存在');

    if (dto.category && !KB_CATEGORIES.some((c) => c.code === dto.category)) {
      throw new BadRequestException('文档分类不合法');
    }

    const tagList = dto.tag_list ?? dto.tagList;
    const permTargets = dto.perm_targets ?? dto.permTargets;

    Object.assign(doc, {
      title: dto.title ?? doc.title,
      category: dto.category ?? doc.category,
      summary: dto.summary ?? doc.summary,
      tagList: tagList === undefined ? doc.tagList : Array.isArray(tagList) ? tagList.join(',') : tagList,
      permScope: dto.perm_scope ?? dto.permScope ?? doc.permScope,
      permTargets:
        permTargets === undefined
          ? doc.permTargets
          : Array.isArray(permTargets)
            ? permTargets.join(',')
            : permTargets,
    });
    await this.docRepo.save(doc);
    return { id };
  }

  /** DELETE /api/v1/kb/doc/:id 删除文档（连同切片、向量、物理文件） */
  async remove(entId: number, id: number) {
    const doc = await this.docRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!doc) throw new NotFoundException('文档不存在');

    await this.chunkRepo.delete({ enterpriseId: entId, docId: id });
    await this.vector.deleteByDoc(entId, id);
    if (doc.filePath) await this.storage.remove(doc.filePath).catch(() => void 0);
    await this.docRepo.delete(id);
    return true;
  }

  /** 重新向量化 */
  async revectorize(entId: number, id: number) {
    const doc = await this.docRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!doc) throw new NotFoundException('文档不存在');
    return this.ai.embedDocument({ enterpriseId: entId, docId: id, content: doc.content || '' });
  }

  /**
   * 知识库问答（PRD 模块3-4）
   * 本质是带知识库检索的 AI 对话，单独开接口便于前端问答页直接调用
   */
  async qa(entId: number, user: AuthUser, question: string, topK = 3) {
    return this.ai.chat({
      enterpriseId: entId,
      userId: user.userId,
      query: question,
      enableKb: true,
      topK,
    });
  }

  /** 知识库总览统计 */
  async overview(entId: number) {
    const [total, vectored, chunkCnt] = await Promise.all([
      this.docRepo.count({ where: { enterpriseId: entId } }),
      this.docRepo.count({ where: { enterpriseId: entId, vectorStatus: 1 } }),
      this.chunkRepo.count({ where: { enterpriseId: entId } }),
    ]);
    return {
      doc_total: total,
      vectored_total: vectored,
      pending_total: total - vectored,
      chunk_total: chunkCnt,
      categories: await this.categoryList(entId),
    };
  }
}
