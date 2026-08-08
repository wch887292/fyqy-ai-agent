import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, RequireMenu, TenantId } from '../../common/auth';
import { ProdService } from './prod.service';

/**
 * 简易生产工单 /api/v1/prod
 * 对应 V2.0 文档「新增简易生产工单管理模块」
 */
@Controller('v1/prod')
export class ProdController {
  constructor(private readonly svc: ProdService) {}

  @Post('workorder/save')
  @RequireMenu('prod', 'prod:workorder')
  save(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.save(entId, user, body);
  }

  @Get('workorder/page')
  @RequireMenu('prod', 'prod:workorder')
  page(@TenantId() entId: number, @Query() query: any) {
    return this.svc.page(entId, query);
  }

  @Put('workorder/status')
  @RequireMenu('prod', 'prod:workorder')
  updateStatus(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.updateStatus(entId, user, body);
  }

  @Post('workorder/stock_in')
  @RequireMenu('prod', 'prod:workorder')
  stockIn(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.stockIn(entId, user, body);
  }

  @Get('workorder/ai_tip')
  @RequireMenu('prod', 'prod:workorder')
  aiTip(@TenantId() entId: number, @Query() query: any) {
    return this.svc.aiTip(entId, query);
  }
}
