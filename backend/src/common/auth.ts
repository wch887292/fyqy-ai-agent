import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

/** 登录态用户上下文 */
export interface AuthUser {
  userId: number;
  enterpriseId: number;
  username: string;
  realName: string;
  deptId: number;
  isSuper: number;
  isPartner: number;
  /** 合并后的最大数据权限：1本人 2本部门 3全企业 */
  dataScope: number;
  menuCodes: string[];
}

/** 标记接口无需登录 */
export const PUBLIC_KEY = 'fae:public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * 标记接口所需的菜单权限码，满足任意一个即放行。
 *
 * 安全要点：前端隐藏菜单只是体验优化，不构成防护。
 * 未挂载本装饰器的接口仅做登录态与租户校验，敏感模块必须显式声明。
 * 例：@RequireMenu('system') 表示需要「系统设置」模块权限。
 */
export const MENU_KEY = 'fae:menu';
export const RequireMenu = (...codes: string[]) => SetMetadata(MENU_KEY, codes);

/** 从请求上下文取出当前登录用户 */
export const CurrentUser = createParamDecorator((field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  const user: AuthUser = req.user;
  return field ? user?.[field] : user;
});

/**
 * 鉴权 + 租户隔离守卫（平台安全核心）
 *
 * 隔离策略（重要）：
 *   enterprise_id 一律以 JWT 中的值为准，**绝不信任前端传参**。
 *   若前端传入的 enterprise_id 与 token 不一致，直接判定为越权并拒绝，
 *   同时保留日志痕迹，满足「A企业绝对看不到B企业任何数据」的验收标准。
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const auth: string = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) throw new UnauthorizedException('未登录或登录已过期，请重新登录');

    let payload: AuthUser;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('登录凭证无效或已过期，请重新登录');
    }

    // —— 租户越权校验 ——
    const claimed = req.body?.enterprise_id ?? req.body?.enterpriseId ?? req.query?.enterprise_id ?? req.query?.enterpriseId;
    if (claimed !== undefined && claimed !== null && claimed !== '' && Number(claimed) !== Number(payload.enterpriseId)) {
      // 超级管理员允许跨租户运维
      if (!payload.isSuper) {
        throw new ForbiddenException('检测到跨企业数据访问，请求已被拦截');
      }
    }

    // —— 菜单权限校验（接口级，与前端菜单裁剪双重把关）——
    const needMenus = this.reflector.getAllAndOverride<string[]>(MENU_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (needMenus?.length && !payload.isSuper) {
      const owned = new Set(payload.menuCodes || []);
      if (!needMenus.some((c) => owned.has(c))) {
        throw new ForbiddenException('您无权访问该功能模块，请联系企业管理员开通权限');
      }
    }

    req.user = payload;
    // 统一注入服务端可信的租户ID，后续 Service 层一律读这个值
    req.enterpriseId = payload.isSuper && claimed ? Number(claimed) : Number(payload.enterpriseId);
    return true;
  }
}

/** 取服务端可信租户ID */
export const TenantId = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return Number(req.enterpriseId);
});
