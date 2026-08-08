import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser, Public, AuthUser } from '../../common/auth';

/**
 * 登录鉴权接口
 * 对应文档 1.2 租户组织模块：/api/v1/user/login、/api/v1/user/logout
 */
@Controller('v1/user')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  /** POST /api/v1/user/login 登录 */
  @Public()
  @Post('login')
  login(@Body() body: any) {
    return this.svc.login(body.username, body.password, body.enterprise_id ?? body.enterpriseId);
  }

  /**
   * POST /api/v1/user/logout 登出
   * JWT 无状态，前端清除本地 token 即可；此处保留接口用于记录操作日志
   */
  @Post('logout')
  logout() {
    return { logout: true };
  }

  /** GET /api/v1/user/profile 当前登录用户信息与菜单 */
  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.svc.profile(user.userId);
  }

  /** POST /api/v1/user/password 修改本人密码 */
  @Post('password')
  changePassword(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.changePassword(
      user.userId,
      body.old_password ?? body.oldPassword,
      body.new_password ?? body.newPassword,
    );
  }
}
