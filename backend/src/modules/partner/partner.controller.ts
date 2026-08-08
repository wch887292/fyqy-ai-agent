import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { PartnerService } from './partner.service';
import { AuthUser, CurrentUser, RequireMenu, TenantId } from '../../common/auth';
import { parseIntId } from '../../common/id.util';

/**
 * 合伙人台账模块 /api/v1/partner
 * 对应文档 1.6 章节，落地飞扬企源「分权 / 分利 / 分风险」三分体系
 *
 * V1.0 边界：分利只做业绩台账与预估分成，不做自动实发分红
 *
 * 权限说明（分权配置同时出现在「组织管理-合伙人设置」与「合伙人管理-分权配置」两个页面，
 * 故两个菜单码任一满足即可放行）：
 *   - 分权：org:partner / partner:config
 *   - 分利：partner:performance
 *   - 分风险：partner:risk
 *   - config/get 允许合伙人本人查看自身权限，放宽到 partner 一级菜单
 */
@Controller('v1/partner')
export class PartnerController {
  constructor(private readonly svc: PartnerService) {}

  // ---------- 分权 ----------

  /** POST /api/v1/partner/config/save 合伙人分权配置保存 */
  @Post('config/save')
  @RequireMenu('org:partner', 'partner:config')
  saveConfig(@TenantId() entId: number, @Body() body: any) {
    return this.svc.saveConfig(entId, body);
  }

  /** GET /api/v1/partner/config/get 获取配置（不传 user_id 时查自己） */
  @Get('config/get')
  @RequireMenu('partner', 'org:partner')
  getConfig(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query('user_id') userId: string) {
    // 不传 user_id 时默认查自己，方便合伙人查看自身权限
    return this.svc.getConfig(entId, userId ? parseIntId(userId, '用户ID') : user.userId);
  }

  /** GET /api/v1/partner/config/page 分权配置列表 */
  @Get('config/page')
  @RequireMenu('org:partner', 'partner:config')
  configPage(@TenantId() entId: number, @Query() query: any) {
    return this.svc.configPage(entId, query);
  }

  /** GET /api/v1/partner/options 可选合伙人下拉 */
  @Get('options')
  @RequireMenu('org:partner', 'partner:config', 'partner:performance')
  options(@TenantId() entId: number) {
    return this.svc.partnerOptions(entId);
  }

  /** DELETE /api/v1/partner/config/:id 删除分权配置 */
  @Delete('config/:id')
  @RequireMenu('org:partner', 'partner:config')
  removeConfig(@TenantId() entId: number, @Param('id') id: string) {
    return this.svc.removeConfig(entId, parseIntId(id, '分权配置ID'));
  }

  // ---------- 分利 ----------

  /** POST /api/v1/partner/rule/save 分利规则保存 */
  @Post('rule/save')
  @RequireMenu('partner:rule')
  ruleSave(@TenantId() entId: number, @Body() body: any) {
    return this.svc.ruleSave(entId, body);
  }

  /** GET /api/v1/partner/rule/page 分利规则分页 */
  @Get('rule/page')
  @RequireMenu('partner:rule')
  rulePage(@TenantId() entId: number, @Query() query: any) {
    return this.svc.rulePage(entId, query);
  }

  /** GET /api/v1/partner/settle/page 结算流水分页 */
  @Get('settle/page')
  @RequireMenu('partner:settle')
  settlePage(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.settlePage(entId, user, query);
  }

  /** POST /api/v1/partner/settle/manual 手动标记结算完成 */
  @Post('settle/manual')
  @RequireMenu('partner:settle')
  settleManual(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.settleManual(entId, user, body);
  }

  /** GET /api/v1/partner/settle/export 导出对账单 */
  @Get('settle/export')
  @RequireMenu('partner:settle')
  settleExport(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.settleExportRows(entId, user, query);
  }

  /** POST /api/v1/partner/performance/save 业绩归属台账新增 */
  @Post('performance/save')
  @RequireMenu('partner:performance')
  savePerformance(@TenantId() entId: number, @Body() body: any) {
    return this.svc.savePerformance(entId, body);
  }

  /** GET /api/v1/partner/performance/page 业绩台账分页 */
  @Get('performance/page')
  @RequireMenu('partner:performance')
  performancePage(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.performancePage(entId, user, query);
  }

  /** DELETE /api/v1/partner/performance/:id 删除台账记录 */
  @Delete('performance/:id')
  @RequireMenu('partner:performance')
  removePerformance(@TenantId() entId: number, @Param('id') id: string) {
    return this.svc.removePerformance(entId, parseIntId(id, '业绩台账ID'));
  }

  // ---------- 分风险 ----------

  /** GET /api/v1/partner/risk/page 风险预警分页 */
  @Get('risk/page')
  @RequireMenu('partner:risk')
  riskPage(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.riskPage(entId, user, query);
  }

  /** POST /api/v1/partner/risk/handle 标记风险已处理 */
  @Post('risk/handle')
  @RequireMenu('partner:risk')
  handleRisk(@TenantId() entId: number, @Body() body: any) {
    return this.svc.handleRisk(entId, parseIntId(body.id, '风险ID'));
  }

  /** POST /api/v1/partner/risk/scan 手动触发风险扫描 */
  @Post('risk/scan')
  @RequireMenu('partner:risk')
  scanRisk(@TenantId() entId: number) {
    return this.svc.scanRisk(entId);
  }

  /** GET /api/v1/partner/overview 合伙人概览 */
  @Get('overview')
  @RequireMenu('org:partner', 'partner:config')
  overview(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.overview(entId, user);
  }
}
