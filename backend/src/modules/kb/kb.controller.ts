import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { KbService } from './kb.service';
import { AuthUser, CurrentUser, RequireMenu, TenantId } from '../../common/auth';
import { parseIntId } from '../../common/id.util';

/**
 * AI 知识库 /api/v1/kb
 * 对应文档 1.3 章节
 *
 * 权限说明：
 *   - category/list 为分类枚举，全体登录可读；
 *   - doc/page 被文档列表与上传页共用，detail/overview 被文档列表与问答页共用，放宽到 kb 一级菜单，
 *     单篇文档的可见范围（全员/部门/角色/指定人）仍由 Service 层按 visible_scope 过滤；
 *   - 上传归 kb:upload，改删与重新向量化归 kb:doc，问答归 kb:qa。
 */
@Controller('v1/kb')
export class KbController {
  constructor(private readonly svc: KbService) {}

  /** GET /api/v1/kb/category/list 获取分类枚举 */
  @Get('category/list')
  categories(@TenantId() entId: number) {
    return this.svc.categoryList(entId);
  }

  /** POST /api/v1/kb/doc/upload 上传文档 */
  @Post('doc/upload')
  @RequireMenu('kb:upload')
  upload(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.upload(entId, user, body);
  }

  /** GET /api/v1/kb/doc/page 文档分页 */
  @Get('doc/page')
  @RequireMenu('kb:doc', 'kb:upload')
  page(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.page(entId, user, query);
  }

  /** GET /api/v1/kb/doc/detail 文档详情 */
  @Get('doc/detail')
  @RequireMenu('kb')
  detail(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query('id') id: string) {
    return this.svc.detail(entId, user, parseIntId(id, '文档ID'));
  }

  /** PUT /api/v1/kb/doc/update 文档修改 */
  @Put('doc/update')
  @RequireMenu('kb:doc')
  update(@TenantId() entId: number, @Body() body: any) {
    return this.svc.update(entId, body);
  }

  /** POST /api/v1/kb/doc/revectorize 重新向量化 */
  @Post('doc/revectorize')
  @RequireMenu('kb:doc')
  revectorize(@TenantId() entId: number, @Body() body: any) {
    return this.svc.revectorize(entId, parseIntId(body.id ?? body.doc_id, '文档ID'));
  }

  /** POST /api/v1/kb/qa 知识库问答 */
  @Post('qa')
  @RequireMenu('kb:qa')
  qa(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.qa(entId, user, body.question ?? body.query ?? '', Number(body.top_k ?? 3));
  }

  /** GET /api/v1/kb/overview 知识库总览 */
  @Get('overview')
  @RequireMenu('kb')
  overview(@TenantId() entId: number) {
    return this.svc.overview(entId);
  }

  /** DELETE /api/v1/kb/doc/:id 删除文档 */
  @Delete('doc/:id')
  @RequireMenu('kb:doc')
  remove(@TenantId() entId: number, @Param('id') id: string) {
    return this.svc.remove(entId, parseIntId(id, '文档ID'));
  }

  /** GET /api/v1/kb/doc/version/list 文档历史版本列表 */
  @Get('doc/version/list')
  @RequireMenu('kb:doc')
  versionList(@TenantId() entId: number, @Query('doc_id') docId: string) {
    return this.svc.versionList(entId, parseIntId(docId, '文档ID'));
  }

  /** POST /api/v1/kb/doc/version/recover 恢复历史版本 */
  @Post('doc/version/recover')
  @RequireMenu('kb:doc')
  recoverVersion(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.recoverVersion(entId, user, parseIntId(body.version_id ?? body.versionId, '版本ID'));
  }

  /** GET /api/v1/kb/chat/history/page 问答会话历史 */
  @Get('chat/history/page')
  @RequireMenu('kb:qa')
  chatHistory(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.chatHistoryPage(entId, user, query);
  }
}
