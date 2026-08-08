import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Department, Enterprise, SysRole, SysUser } from '../../entities';
import { AuthUser } from '../../common/auth';
import { ALL_MENU_CODES, filterMenu } from '../../common/menus';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(SysRole) private readonly roleRepo: Repository<SysRole>,
    @InjectRepository(Enterprise) private readonly entRepo: Repository<Enterprise>,
    @InjectRepository(Department) private readonly deptRepo: Repository<Department>,
    private readonly jwt: JwtService,
  ) {}

  /**
   * 汇总用户的菜单权限与数据权限
   * 多角色取并集，数据权限取最大值
   */
  async resolvePermission(user: SysUser): Promise<{ dataScope: number; menuCodes: string[] }> {
    if (user.isSuper) return { dataScope: 3, menuCodes: ALL_MENU_CODES };

    const ids = (user.roleIds || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => n > 0);
    if (!ids.length) return { dataScope: 1, menuCodes: [] };

    const roles = await this.roleRepo.find({
      where: { id: In(ids), enterpriseId: user.enterpriseId },
    });
    let dataScope = 1;
    const set = new Set<string>();
    for (const r of roles) {
      dataScope = Math.max(dataScope, r.dataScope || 1);
      (r.menuCodes || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((c) => set.add(c));
    }
    return { dataScope, menuCodes: [...set] };
  }

  /** 登录：账号密码校验 -> 生成 JWT -> 返回用户信息与菜单 */
  async login(username: string, password: string, enterpriseId?: number) {
    if (!username || !password) throw new BadRequestException('请输入账号与密码');

    const where: any = { username: username.trim() };
    if (enterpriseId) where.enterpriseId = Number(enterpriseId);

    // password 字段 select:false，需显式选出
    const user = await this.userRepo.findOne({
      where,
      select: {
        id: true,
        enterpriseId: true,
        deptId: true,
        roleIds: true,
        username: true,
        password: true,
        realName: true,
        phone: true,
        post: true,
        isPartner: true,
        isSuper: true,
        status: true,
      },
    });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    if (!user.status) throw new UnauthorizedException('账号已被停用，请联系企业管理员');

    const ok = await bcrypt.compare(password, user.password || '');
    if (!ok) throw new UnauthorizedException('账号或密码错误');

    const perm = await this.resolvePermission(user);
    const payload: AuthUser = {
      userId: Number(user.id),
      enterpriseId: Number(user.enterpriseId),
      username: user.username,
      realName: user.realName || user.username,
      deptId: Number(user.deptId || 0),
      isSuper: user.isSuper || 0,
      isPartner: user.isPartner || 0,
      dataScope: perm.dataScope,
      menuCodes: perm.menuCodes,
    };
    const token = await this.jwt.signAsync(payload as any);

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const ent = await this.entRepo.findOne({ where: { id: user.enterpriseId } });
    const dept = user.deptId ? await this.deptRepo.findOne({ where: { id: user.deptId } }) : null;

    return {
      token,
      user: {
        user_id: payload.userId,
        username: payload.username,
        real_name: payload.realName,
        phone: user.phone,
        post: user.post,
        dept_id: payload.deptId,
        dept_name: dept?.name || '',
        is_super: payload.isSuper,
        is_partner: payload.isPartner,
        data_scope: payload.dataScope,
        enterprise_id: payload.enterpriseId,
        enterprise_name: ent?.name || '',
      },
      menus: filterMenu(perm.menuCodes, !!user.isSuper),
      menu_codes: perm.menuCodes,
    };
  }

  /** 获取当前登录用户信息（刷新页面时重新拉取，保证权限实时） */
  async profile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const perm = await this.resolvePermission(user);
    const ent = await this.entRepo.findOne({ where: { id: user.enterpriseId } });
    const dept = user.deptId ? await this.deptRepo.findOne({ where: { id: user.deptId } }) : null;
    return {
      user_id: Number(user.id),
      username: user.username,
      real_name: user.realName,
      phone: user.phone,
      post: user.post,
      dept_id: Number(user.deptId || 0),
      dept_name: dept?.name || '',
      is_super: user.isSuper,
      is_partner: user.isPartner,
      data_scope: perm.dataScope,
      enterprise_id: Number(user.enterpriseId),
      enterprise_name: ent?.name || '',
      menus: filterMenu(perm.menuCodes, !!user.isSuper),
      menu_codes: perm.menuCodes,
    };
  }

  /** 修改本人密码 */
  async changePassword(userId: number, oldPwd: string, newPwd: string) {
    if (!newPwd || newPwd.length < 6) throw new BadRequestException('新密码长度不能少于6位');
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) throw new UnauthorizedException('用户不存在');
    if (!(await bcrypt.compare(oldPwd || '', user.password || ''))) {
      throw new BadRequestException('原密码不正确');
    }
    await this.userRepo.update(userId, { password: await bcrypt.hash(newPwd, 10) });
    return true;
  }
}
