import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, TenantId } from '../../common/auth';
import { NoticeService } from './notice.service';
import { parseIntId } from '../../common/id.util';

/**
 * 站内消息通知 /api/v1/notice
 * 对应 V2.0 文档「站内消息通知中心」
 *
 * 说明：消息属于「个人收件箱」，任何登录用户均可见自己的消息，
 * 无需挂 RequireMenu（前端铃铛全局可用）；跨租户由 enterpriseId 隔离。
 */
@Controller('v1/notice')
export class NoticeController {
  constructor(private readonly svc: NoticeService) {}

  @Get('page')
  page(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.page(entId, user.userId, query);
  }

  @Get('unread/count')
  unreadCount(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.unreadCount(entId, user.userId);
  }

  @Put('read')
  read(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.read(entId, user.userId, parseIntId(body.notice_id ?? body.noticeId ?? body.id, '消息ID'));
  }

  @Put('read_all')
  readAll(@TenantId() entId: number, @CurrentUser() user: AuthUser) {
    return this.svc.readAll(entId, user.userId);
  }
}
