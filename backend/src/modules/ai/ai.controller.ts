import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthUser, CurrentUser, RequireMenu, TenantId } from '../../common/auth';
import { parseIntId } from '../../common/id.util';

/**
 * AI 中间层控制器 /api/ai
 * 严格对应《V1.0 完整交付输出》1.1 章节七个接口
 *
 * 安全约定：请求体里的 enterprise_id 仅作兼容保留，
 * 服务端一律使用 TenantId（来自 JWT）作为真实租户，杜绝越权。
 *
 * 权限说明：对话与检索要求「企业AI助手」或「知识库问答」权限，
 * 文档解析与向量化属知识库运维，要求 kb:upload / kb:doc。
 */
@Controller('ai')
export class AiController {
  constructor(private readonly svc: AiService) {}

  /** POST /api/ai/chat 企业AI对话，自动关联知识库语义检索 */
  @Post('chat')
  @RequireMenu('workbench:assistant', 'kb:qa')
  chat(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.chat({
      enterpriseId: entId,
      userId: user.userId,
      query: body.query ?? body.question ?? '',
      history: body.history || [],
      enableKb: body.enable_kb ?? body.enableKb,
      topK: Number(body.top_k ?? body.topK ?? 3),
    });
  }

  /** POST /api/ai/document/parse 文档解析 */
  @Post('document/parse')
  @RequireMenu('kb:upload', 'kb:doc')
  parse(@Body() body: any) {
    return this.svc.parseDocument({
      fileBase64: body.file_base64 ?? body.fileBase64 ?? '',
      fileName: body.file_name ?? body.fileName ?? '',
    });
  }

  /** POST /api/ai/document/embedding 文档切片写入向量库 */
  @Post('document/embedding')
  @RequireMenu('kb:upload', 'kb:doc')
  embedding(@TenantId() entId: number, @Body() body: any) {
    return this.svc.embedDocument({
      enterpriseId: entId,
      docId: parseIntId(body.doc_id ?? body.docId, '文档ID'),
      content: body.content ?? '',
    });
  }

  /** POST /api/ai/search 知识库语义检索（自动权限过滤） */
  @Post('search')
  @RequireMenu('workbench:assistant', 'kb:qa')
  async search(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    const list = await this.svc.search({
      enterpriseId: entId,
      userId: user.userId,
      query: body.query ?? '',
      topK: Number(body.top_k ?? body.topK ?? 3),
    });
    return { list, total: list.length };
  }

  /** POST /api/ai/extract 文本信息抽取 */
  @Post('extract')
  @RequireMenu('workbench:assistant', 'kb:qa')
  extract(@TenantId() entId: number, @Body() body: any) {
    return this.svc.extract({ enterpriseId: entId, text: body.text ?? '' });
  }

  /** POST /api/ai/generate AI内容生成 */
  @Post('generate')
  @RequireMenu('workbench:assistant', 'kb:qa')
  generate(@TenantId() entId: number, @Body() body: any) {
    return this.svc.generate({
      enterpriseId: entId,
      prompt: body.prompt ?? '',
      context: body.context ?? '',
      scene: body.scene,
    });
  }

  /** POST /api/ai/classify AI分类打分 */
  @Post('classify')
  @RequireMenu('workbench:assistant', 'crm:customer')
  classify(@TenantId() entId: number, @Body() body: any) {
    return this.svc.classify({
      enterpriseId: entId,
      bizType: body.biz_type ?? body.bizType ?? 'customer_intention',
      context: body.context ?? '',
      features: {
        followCount: Number(body.follow_count ?? body.followCount ?? 0),
        daysSinceLastFollow: Number(body.days_since_last_follow ?? body.daysSinceLastFollow ?? 999),
        text: body.text ?? body.context ?? '',
      },
    });
  }

  /** GET /api/ai/chat/history 对话历史 */
  @Get('chat/history')
  @RequireMenu('workbench:assistant', 'kb:qa')
  history(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() q: any) {
    return this.svc.chatHistory(entId, user.userId, Number(q.limit ?? 20));
  }
}
