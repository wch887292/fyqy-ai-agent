import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CrmService } from './crm.service';
import { AuthUser, CurrentUser, RequireMenu, TenantId } from '../../common/auth';
import { parseIntId } from '../../common/id.util';

/**
 * AI 销售 CRM /api/v1/crm
 * 对应文档 1.4 章节
 *
 * 权限说明：
 *   - customer/page 与 detail 被客户管理、客户公海、ERP 订单开单三处共用，放宽到 crm 一级菜单，
 *     真正的行级可见性由 data_scope（本人/本部门/全企业）在 Service 层收口；
 *   - 公海领取归 crm:public，跟进归 crm:follow，日报归 crm:daily，统计归 crm:stat。
 */
@Controller('v1/crm')
export class CrmController {
  constructor(private readonly svc: CrmService) {}

  // ---------- 客户 ----------

  /** POST /api/v1/crm/customer/save 新增/编辑客户 */
  @Post('customer/save')
  @RequireMenu('crm:customer')
  saveCustomer(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.saveCustomer(entId, user, body);
  }

  /** GET /api/v1/crm/customer/page 客户分页，固定每页10条 */
  @Get('customer/page')
  @RequireMenu('crm')
  customerPage(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.customerPage(entId, user, query);
  }

  /** GET /api/v1/crm/customer/detail 客户详情（含跟进记录） */
  @Get('customer/detail')
  @RequireMenu('crm')
  customerDetail(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query('id') id: string) {
    return this.svc.customerDetail(entId, user, parseIntId(id, '客户ID'));
  }

  /** POST /api/v1/crm/customer/public 移入公海 */
  @Post('customer/public')
  @RequireMenu('crm:customer', 'crm:public')
  toPublic(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    const ids = body.ids ?? (body.id ? [body.id] : []);
    return this.svc.moveToPublic(entId, user, ids.map(Number));
  }

  /** POST /api/v1/crm/customer/claim 公海领取客户 */
  @Post('customer/claim')
  @RequireMenu('crm:public', 'crm:customer')
  claim(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    const ids = body.ids ?? (body.id ? [body.id] : []);
    return this.svc.claim(entId, user, ids.map(Number));
  }

  /** POST /api/v1/crm/customer/score 重新触发AI意向评分 */
  @Post('customer/score')
  @RequireMenu('crm:customer')
  score(@TenantId() entId: number, @Body() body: any) {
    return this.svc.scoreCustomer(entId, parseIntId(body.id ?? body.customer_id, '客户ID'));
  }

  /** GET /api/v1/crm/customer/export 导出数据（前端生成Excel） */
  @Get('customer/export')
  @RequireMenu('crm:customer')
  exportRows(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.exportRows(entId, user, query);
  }

  /** DELETE /api/v1/crm/customer/:id 删除客户 */
  @Delete('customer/:id')
  @RequireMenu('crm:customer')
  removeCustomer(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.removeCustomer(entId, user, parseIntId(id, '客户ID'));
  }

  // ---------- 跟进 ----------

  /** POST /api/v1/crm/follow/save 新增跟进记录 */
  @Post('follow/save')
  @RequireMenu('crm:follow', 'crm:customer')
  saveFollow(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.saveFollow(entId, user, body);
  }

  /** GET /api/v1/crm/follow/list 指定客户的跟进列表 */
  @Get('follow/list')
  @RequireMenu('crm:follow', 'crm:customer')
  followList(@TenantId() entId: number, @Query('customer_id') customerId: string) {
    return this.svc.followList(entId, parseIntId(customerId, '客户ID'));
  }

  /** GET /api/v1/crm/follow/page 全部跟进记录分页 */
  @Get('follow/page')
  @RequireMenu('crm:follow')
  followPage(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.followPage(entId, user, query);
  }

  // ---------- 销售日报 ----------

  /** POST /api/v1/crm/daily/report/save 保存销售日报 */
  @Post('daily/report/save')
  @RequireMenu('crm:daily')
  saveReport(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.saveReport(entId, user, body);
  }

  /** GET /api/v1/crm/daily/report/get 获取个人日报 */
  @Get('daily/report/get')
  @RequireMenu('crm:daily')
  getReport(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.getReport(entId, user, query);
  }

  /** POST /api/v1/crm/daily/report/ai_generate AI一键生成日报 */
  @Post('daily/report/ai_generate')
  @RequireMenu('crm:daily')
  aiGenerate(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.aiGenerateReport(entId, user, body);
  }

  /** GET /api/v1/crm/daily/report/page 日报分页 */
  @Get('daily/report/page')
  @RequireMenu('crm:daily')
  reportPage(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.reportPage(entId, user, query);
  }

  // ---------- 统计 ----------

  /** GET /api/v1/crm/stat 销售统计 */
  @Get('stat')
  @RequireMenu('crm:stat')
  stat(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.stat(entId, user);
  }
}
