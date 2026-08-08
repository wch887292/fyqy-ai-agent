import { Controller, Get } from '@nestjs/common';
import { WorkbenchService } from './workbench.service';
import { AuthUser, CurrentUser, RequireMenu, TenantId } from '../../common/auth';

/**
 * AI 工作台（首页）/api/v1/workbench
 * 对应 PRD 模块 1
 *
 * 权限说明：整个控制器统一要求 workbench 菜单权限，
 * 内部数据仍按 data_scope 逐条过滤，员工只能看到自己权限范围内的待办与统计。
 */
@Controller('v1/workbench')
@RequireMenu('workbench')
export class WorkbenchController {
  constructor(private readonly svc: WorkbenchService) {}

  /** GET /api/v1/workbench/index 首页聚合数据（推荐前端只调这一个） */
  @Get('index')
  index(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.index(entId, user);
  }

  /** GET /api/v1/workbench/todo 待办事项 */
  @Get('todo')
  todo(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.todo(entId, user);
  }

  /** GET /api/v1/workbench/overview 统计卡片 */
  @Get('overview')
  overview(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.overview(entId, user);
  }

  /** GET /api/v1/workbench/ai_briefing AI 经营简报 */
  @Get('ai_briefing')
  aiBriefing(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.aiBriefing(entId, user);
  }

  /** GET /api/v1/workbench/shortcuts 快捷入口与公告 */
  @Get('shortcuts')
  shortcuts(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.shortcuts(entId, user);
  }

  /** GET /api/v1/workbench/trend 近 7 日趋势 */
  @Get('trend')
  trend(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.trend(entId, user);
  }
}
