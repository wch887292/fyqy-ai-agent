import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { OrgService } from './org.service';
import { AuthUser, CurrentUser, RequireMenu, TenantId } from '../../common/auth';
import { parseIntId } from '../../common/id.util';

/**
 * 企业租户 /api/v1/enterprise
 *
 * 权限说明：企业档案属「系统设置 - 企业配置」范畴，普通员工不可见。
 */
@Controller('v1/enterprise')
export class EnterpriseController {
  constructor(private readonly svc: OrgService) {}

  /** POST /api/v1/enterprise/create 创建企业（仅超级管理员） */
  @Post('create')
  create(@CurrentUser() user: AuthUser, @Body() body: any) {
    if (!user.isSuper) throw new ForbiddenException('仅平台超级管理员可创建企业租户');
    return this.svc.createEnterprise(body);
  }

  /** GET /api/v1/enterprise/info 获取企业信息 */
  @Get('info')
  @RequireMenu('system:enterprise')
  info(@TenantId() entId: number) {
    return this.svc.enterpriseInfo(entId);
  }

  /** POST /api/v1/enterprise/update 修改企业信息 */
  @Post('update')
  @RequireMenu('system:enterprise')
  update(@TenantId() entId: number, @Body() body: any) {
    return this.svc.updateEnterprise(entId, body);
  }

  /** GET /api/v1/enterprise/page 企业列表（仅超级管理员） */
  @Get('page')
  page(@CurrentUser() user: AuthUser, @Query() query: any) {
    if (!user.isSuper) throw new ForbiddenException('无权访问平台级企业列表');
    return this.svc.enterprisePage(query);
  }
}

/**
 * 部门 /api/v1/dept
 *
 * 权限说明：部门树是知识库可见范围、客户归属等表单的公共下拉数据源，
 * 故 list 对全体登录用户开放；增删改收口到「组织管理 - 部门管理」。
 */
@Controller('v1/dept')
export class DeptController {
  constructor(private readonly svc: OrgService) {}

  /** POST /api/v1/dept/save 部门新增编辑 */
  @Post('save')
  @RequireMenu('org:dept')
  save(@TenantId() entId: number, @Body() body: any) {
    return this.svc.saveDept(entId, body);
  }

  /** GET /api/v1/dept/list 部门树（公共下拉，全体登录可读） */
  @Get('list')
  list(@TenantId() entId: number) {
    return this.svc.deptTree(entId);
  }

  /** DELETE /api/v1/dept/:id 删除部门 */
  @Delete(':id')
  @RequireMenu('org:dept')
  remove(@TenantId() entId: number, @Param('id') id: string) {
    return this.svc.deleteDept(entId, parseIntId(id, '部门ID'));
  }
}

/**
 * 角色 /api/v1/role
 *
 * 权限说明：role/list 与 menu_tree 是知识库授权、员工编辑等表单的公共数据源，
 * 且不含敏感业务数据，对全体登录用户开放；授权与增删改收口到「角色与权限」。
 */
@Controller('v1/role')
export class RoleController {
  constructor(private readonly svc: OrgService) {}

  /** POST /api/v1/role/save 角色保存 */
  @Post('save')
  @RequireMenu('org:role')
  save(@TenantId() entId: number, @Body() body: any) {
    return this.svc.saveRole(entId, body);
  }

  /** GET /api/v1/role/list 角色列表（公共下拉，全体登录可读） */
  @Get('list')
  list(@TenantId() entId: number) {
    return this.svc.roleList(entId);
  }

  /** POST /api/v1/role/perm 角色权限保存 */
  @Post('perm')
  @RequireMenu('org:role')
  perm(@TenantId() entId: number, @Body() body: any) {
    return this.svc.saveRolePerm(entId, body);
  }

  /** GET /api/v1/role/menu_tree 全部菜单树（静态元数据，全体登录可读） */
  @Get('menu_tree')
  menuTree() {
    return this.svc.menuTree();
  }

  /** DELETE /api/v1/role/:id 删除角色 */
  @Delete(':id')
  @RequireMenu('org:role')
  remove(@TenantId() entId: number, @Param('id') id: string) {
    return this.svc.deleteRole(entId, parseIntId(id, '角色ID'));
  }
}

/**
 * 员工 /api/v1/user（登录相关见 AuthController）
 *
 * 权限说明：user/options 仅返回 id + 姓名，是客户归属、跟进人等表单的公共下拉，
 * 对全体登录用户开放；包含手机号、账号状态的 page 与全部写操作收口到「员工管理」。
 */
@Controller('v1/user')
export class UserController {
  constructor(private readonly svc: OrgService) {}

  /** POST /api/v1/user/save 用户新增编辑 */
  @Post('save')
  @RequireMenu('org:user')
  save(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.saveUser(entId, body, user);
  }

  /** GET /api/v1/user/page 用户分页 */
  @Get('page')
  @RequireMenu('org:user')
  page(@TenantId() entId: number, @Query() query: any) {
    return this.svc.userPage(entId, query);
  }

  /** GET /api/v1/user/options 员工下拉（公共下拉，全体登录可读） */
  @Get('options')
  options(@TenantId() entId: number) {
    return this.svc.userOptions(entId);
  }

  /** POST /api/v1/user/reset_password 重置员工密码 */
  @Post('reset_password')
  @RequireMenu('org:user')
  reset(@TenantId() entId: number, @Body() body: any) {
    const id = Number(body.id ?? body.user_id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('员工ID无效');
    }
    return this.svc.resetPassword(entId, id, body.password);
  }

  /** DELETE /api/v1/user/:id 删除员工 */
  @Delete(':id')
  @RequireMenu('org:user')
  remove(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteUser(entId, parseIntId(id, '员工ID'), user);
  }
}
