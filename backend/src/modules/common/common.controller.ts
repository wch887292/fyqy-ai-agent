import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CommonService } from './common.service';
import { CurrentUser, RequireMenu, TenantId } from '../../common/auth';
import { AuthUser } from '../../common/auth';

/**
 * V2.0 批量导入导出
 *
 * 权限沿用对应业务菜单，不新增菜单码：
 *   客户导入导出 -> crm:customer
 *   知识库批量上传 -> kb:upload
 *   订单导出 -> erp:order
 *   工单导出 -> prod:workorder
 *
 * 导出接口统一返回 { file_name, file_base64, total }，前端转 Blob 下载；
 * 导入接口同时支持 multipart/form-data（file）与 JSON（file_base64）。
 */
@Controller('v1/common')
export class CommonController {
  constructor(private readonly svc: CommonService) {}

  /** GET /api/v1/common/template/customer 下载客户导入模板 */
  @Get('template/customer')
  @RequireMenu('crm:customer')
  customerTemplate() {
    return this.svc.customerTemplate();
  }

  /** POST /api/v1/common/import/customer CRM 客户 Excel 批量导入 */
  @Post('import/customer')
  @RequireMenu('crm:customer')
  @UseInterceptors(FileInterceptor('file'))
  importCustomer(
    @TenantId() entId: number,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    return this.svc.importCustomer(entId, user, file, body);
  }

  /** GET /api/v1/common/export/customer 客户列表导出 Excel */
  @Get('export/customer')
  @RequireMenu('crm:customer')
  exportCustomer(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.exportCustomer(entId, user, query);
  }

  /** POST /api/v1/common/import/kb 知识库批量上传文档 */
  @Post('import/kb')
  @RequireMenu('kb:upload')
  @UseInterceptors(FilesInterceptor('files', 50))
  importKb(
    @TenantId() entId: number,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: any[],
    @Body() body: any,
  ) {
    return this.svc.importKb(entId, user, files, body);
  }

  /** GET /api/v1/common/export/order 订单列表导出 Excel */
  @Get('export/order')
  @RequireMenu('erp:order')
  exportOrder(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.exportOrder(entId, user, query);
  }

  /** GET /api/v1/common/export/workorder 生产工单导出 Excel */
  @Get('export/workorder')
  @RequireMenu('prod:workorder')
  exportWorkorder(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.exportWorkorder(entId, user, query);
  }
}
