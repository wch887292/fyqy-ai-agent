import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ErpService } from './erp.service';
import { AuthUser, CurrentUser, RequireMenu, TenantId } from '../../common/auth';
import { parseIntId } from '../../common/id.util';
import { ORDER_STATUS, ORDER_STATUS_FLOW } from '../../entities';

/**
 * 轻量化 AI-ERP /api/v1/erp
 * 对应文档 1.5 章节。V1.0 边界：不做财务总账与会计凭证。
 *
 * 权限说明：
 *   - overview / product options 被产品、库存、订单、日报四个页面共用，放宽到 erp 一级菜单；
 *   - 库存成本与出入库流水属敏感数据，收口到 erp:stock（产品页的「快速入库」额外允许 erp:product）；
 *   - status_flow 为静态枚举，不做限制。
 */
@Controller('v1/erp')
export class ErpController {
  constructor(private readonly svc: ErpService) {}

  // ---------- 产品 ----------

  /** POST /api/v1/erp/product/save 产品保存 */
  @Post('product/save')
  @RequireMenu('erp:product')
  saveProduct(@TenantId() entId: number, @Body() body: any) {
    return this.svc.saveProduct(entId, body);
  }

  /** GET /api/v1/erp/product/page 产品分页 */
  @Get('product/page')
  @RequireMenu('erp:product')
  productPage(@TenantId() entId: number, @Query() query: any) {
    return this.svc.productPage(entId, query);
  }

  /** GET /api/v1/erp/product/options 产品下拉（订单、库存页共用） */
  @Get('product/options')
  @RequireMenu('erp')
  productOptions(@TenantId() entId: number) {
    return this.svc.productOptions(entId);
  }

  /** DELETE /api/v1/erp/product/:id 删除产品 */
  @Delete('product/:id')
  @RequireMenu('erp:product')
  removeProduct(@TenantId() entId: number, @Param('id') id: string) {
    return this.svc.removeProduct(entId, parseIntId(id, '产品ID'));
  }

  // ---------- 库存 ----------

  /** POST /api/v1/erp/stock/in 入库（库存页与产品页快速入库共用） */
  @Post('stock/in')
  @RequireMenu('erp:stock', 'erp:product')
  stockIn(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.stockIn(entId, user, body);
  }

  /** POST /api/v1/erp/stock/out 出库 */
  @Post('stock/out')
  @RequireMenu('erp:stock')
  stockOut(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.stockOut(entId, user, body);
  }

  /** GET /api/v1/erp/stock/warn_list 库存缺货预警列表 */
  @Get('stock/warn_list')
  @RequireMenu('erp:stock')
  warnList(@TenantId() entId: number, @Query() query: any) {
    return this.svc.warnList(entId, query);
  }

  /** POST /api/v1/erp/stock/warn_handle 处理预警 */
  @Post('stock/warn_handle')
  @RequireMenu('erp:stock')
  handleWarn(@TenantId() entId: number, @Body() body: any) {
    return this.svc.handleWarn(entId, parseIntId(body.id, '预警ID'));
  }

  /** GET /api/v1/erp/stock/record 出入库流水 */
  @Get('stock/record')
  @RequireMenu('erp:stock')
  stockRecord(@TenantId() entId: number, @Query() query: any) {
    return this.svc.stockRecordPage(entId, query);
  }

  // ---------- 订单 ----------

  /** POST /api/v1/erp/order/create 创建订单 */
  @Post('order/create')
  @RequireMenu('erp:order')
  createOrder(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.createOrder(entId, user, body);
  }

  /** PUT /api/v1/erp/order/status 更新订单状态 */
  @Put('order/status')
  @RequireMenu('erp:order')
  updateStatus(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.updateOrderStatus(entId, user, body);
  }

  /** GET /api/v1/erp/order/page 订单分页 */
  @Get('order/page')
  @RequireMenu('erp:order')
  orderPage(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.orderPage(entId, user, query);
  }

  /** GET /api/v1/erp/order/detail 订单详情 */
  @Get('order/detail')
  @RequireMenu('erp:order')
  orderDetail(@TenantId() entId: number, @Query('id') id: string) {
    return this.svc.orderDetail(entId, parseIntId(id, '订单ID'));
  }

  /** GET /api/v1/erp/order/status_flow 状态流转规则（静态枚举） */
  @Get('order/status_flow')
  statusFlow() {
    return { status_list: ORDER_STATUS, flow: ORDER_STATUS_FLOW };
  }

  /** GET /api/v1/erp/order/ai_daily 简易 AI 经营日报 */
  @Get('order/ai_daily')
  @RequireMenu('erp:daily')
  aiDaily(@TenantId() entId: number, @Query('date') date: string) {
    return this.svc.aiDaily(entId, date);
  }

  /** GET /api/v1/erp/overview ERP 概览（多页面共用统计卡片） */
  @Get('overview')
  @RequireMenu('erp')
  overview(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.overview(entId, user);
  }
}
