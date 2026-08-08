import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Department, Enterprise, SysRole, SysUser } from '../../entities';
import { pageResult } from '../../common/result';
import { parsePage } from '../../common/scope';
import { ALL_MENU_CODES, MENU_TREE, PARTNER_MENU_CODES, SALES_MENU_CODES } from '../../common/menus';
import { AuthUser } from '../../common/auth';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(Enterprise) private readonly entRepo: Repository<Enterprise>,
    @InjectRepository(Department) private readonly deptRepo: Repository<Department>,
    @InjectRepository(SysRole) private readonly roleRepo: Repository<SysRole>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
  ) {}

  // ==================== 企业 ====================

  /**
   * 创建企业租户（超级管理员操作）
   * 创建时自动初始化：默认部门 + 三个内置角色 + 企业管理员账号
   */
  async createEnterprise(dto: any) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('企业名称不能为空');
    if (await this.entRepo.findOne({ where: { name } })) {
      throw new BadRequestException('该企业名称已存在');
    }

    const ent = await this.entRepo.save(
      this.entRepo.create({
        name,
        shortName: dto.short_name ?? dto.shortName ?? '',
        industry: dto.industry ?? '',
        contactPerson: dto.contact_person ?? dto.contactPerson ?? '',
        contactPhone: dto.contact_phone ?? dto.contactPhone ?? '',
        status: 1,
      }),
    );

    const entId = Number(ent.id);
    const dept = await this.deptRepo.save(
      this.deptRepo.create({ enterpriseId: entId, name: '总经办', parentId: 0, sort: 0 }),
    );

    const adminRole = await this.roleRepo.save(
      this.roleRepo.create({
        enterpriseId: entId,
        roleName: '企业管理员',
        roleCode: 'ent_admin',
        dataScope: 3,
        menuCodes: ALL_MENU_CODES.join(','),
        remark: '企业内最高权限',
      }),
    );
    await this.roleRepo.save([
      this.roleRepo.create({
        enterpriseId: entId,
        roleName: '部门管理员',
        roleCode: 'dept_admin',
        dataScope: 2,
        menuCodes: [...SALES_MENU_CODES, 'org', 'org:dept', 'org:user'].join(','),
        remark: '本部门数据权限',
      }),
      this.roleRepo.create({
        enterpriseId: entId,
        roleName: '普通员工',
        roleCode: 'staff',
        dataScope: 1,
        menuCodes: SALES_MENU_CODES.join(','),
        remark: '仅本人数据',
      }),
      this.roleRepo.create({
        enterpriseId: entId,
        roleName: '合伙人',
        roleCode: 'partner',
        dataScope: 2,
        menuCodes: PARTNER_MENU_CODES.join(','),
        remark: '分权、业绩台账、风险预警',
      }),
    ]);

    const username = (dto.admin_username || dto.adminUsername || 'admin').trim();
    const rawPwd = dto.admin_password || dto.adminPassword || '123456';
    await this.userRepo.save(
      this.userRepo.create({
        enterpriseId: entId,
        deptId: Number(dept.id),
        roleIds: String(adminRole.id),
        username,
        password: await bcrypt.hash(rawPwd, 10),
        realName: dto.contact_person ?? dto.contactPerson ?? '企业管理员',
        phone: dto.contact_phone ?? dto.contactPhone ?? '',
        post: '企业管理员',
        isPartner: 0,
        isSuper: 0,
        status: 1,
      }),
    );

    return { enterprise_id: entId, admin_username: username, init_password: rawPwd };
  }

  async enterpriseInfo(entId: number) {
    const ent = await this.entRepo.findOne({ where: { id: entId } });
    if (!ent) throw new NotFoundException('企业不存在');
    const [deptCnt, userCnt] = await Promise.all([
      this.deptRepo.count({ where: { enterpriseId: entId } }),
      this.userRepo.count({ where: { enterpriseId: entId } }),
    ]);
    return { ...ent, dept_count: deptCnt, user_count: userCnt };
  }

  async updateEnterprise(entId: number, dto: any) {
    const ent = await this.entRepo.findOne({ where: { id: entId } });
    if (!ent) throw new NotFoundException('企业不存在');
    Object.assign(ent, {
      name: dto.name ?? ent.name,
      shortName: dto.short_name ?? dto.shortName ?? ent.shortName,
      industry: dto.industry ?? ent.industry,
      contactPerson: dto.contact_person ?? dto.contactPerson ?? ent.contactPerson,
      contactPhone: dto.contact_phone ?? dto.contactPhone ?? ent.contactPhone,
    });
    await this.entRepo.save(ent);
    return true;
  }

  /** 超级管理员：企业列表 */
  async enterprisePage(query: any) {
    const { page, size, skip, take } = parsePage(query);
    const where: any = {};
    if (query.keyword) where.name = Like(`%${query.keyword}%`);
    const [list, total] = await this.entRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip,
      take,
    });
    return pageResult(list, total, page, size);
  }

  // ==================== 部门 ====================

  async saveDept(entId: number, dto: any) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('部门名称不能为空');
    const id = Number(dto.id || 0);

    if (id) {
      const dept = await this.deptRepo.findOne({ where: { id, enterpriseId: entId } });
      if (!dept) throw new NotFoundException('部门不存在');
      if (Number(dto.parent_id ?? dto.parentId ?? dept.parentId) === id) {
        throw new BadRequestException('上级部门不能是自己');
      }
      Object.assign(dept, {
        name,
        parentId: Number(dto.parent_id ?? dto.parentId ?? dept.parentId),
        leaderUserId: Number(dto.leader_user_id ?? dto.leaderUserId ?? dept.leaderUserId ?? 0),
        sort: Number(dto.sort ?? dept.sort ?? 0),
      });
      await this.deptRepo.save(dept);
      return { id };
    }

    const saved = await this.deptRepo.save(
      this.deptRepo.create({
        enterpriseId: entId,
        name,
        parentId: Number(dto.parent_id ?? dto.parentId ?? 0),
        leaderUserId: Number(dto.leader_user_id ?? dto.leaderUserId ?? 0),
        sort: Number(dto.sort ?? 0),
      }),
    );
    return { id: Number(saved.id) };
  }

  /** 部门树 */
  async deptTree(entId: number) {
    const list = await this.deptRepo.find({
      where: { enterpriseId: entId },
      order: { sort: 'ASC', id: 'ASC' },
    });
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    const cntMap = new Map<number, number>();
    users.forEach((u) => cntMap.set(Number(u.deptId), (cntMap.get(Number(u.deptId)) || 0) + 1));
    const leaderMap = new Map<number, string>();
    users.forEach((u) => leaderMap.set(Number(u.id), u.realName || u.username));

    const nodes = list.map((d) => ({
      id: Number(d.id),
      name: d.name,
      parent_id: Number(d.parentId || 0),
      leader_user_id: Number(d.leaderUserId || 0),
      leader_name: leaderMap.get(Number(d.leaderUserId)) || '',
      sort: d.sort,
      user_count: cntMap.get(Number(d.id)) || 0,
      children: [] as any[],
    }));
    const map = new Map(nodes.map((n) => [n.id, n]));
    const roots: any[] = [];
    for (const n of nodes) {
      const parent = n.parent_id ? map.get(n.parent_id) : null;
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    return roots;
  }

  async deleteDept(entId: number, id: number) {
    const dept = await this.deptRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!dept) throw new NotFoundException('部门不存在');
    if (await this.deptRepo.count({ where: { enterpriseId: entId, parentId: id } })) {
      throw new BadRequestException('该部门下还有子部门，无法删除');
    }
    if (await this.userRepo.count({ where: { enterpriseId: entId, deptId: id } })) {
      throw new BadRequestException('该部门下还有员工，无法删除');
    }
    await this.deptRepo.delete(id);
    return true;
  }

  /** 取某部门（含子部门）的全部用户ID，用于「本部门」数据权限 */
  async deptUserIds(entId: number, deptId: number): Promise<number[]> {
    if (!deptId) return [];
    const all = await this.deptRepo.find({ where: { enterpriseId: entId } });
    const childIds = new Set<number>([Number(deptId)]);
    let grow = true;
    while (grow) {
      grow = false;
      for (const d of all) {
        if (childIds.has(Number(d.parentId)) && !childIds.has(Number(d.id))) {
          childIds.add(Number(d.id));
          grow = true;
        }
      }
    }
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    return users.filter((u) => childIds.has(Number(u.deptId))).map((u) => Number(u.id));
  }

  // ==================== 角色 ====================

  async saveRole(entId: number, dto: any) {
    const roleName = (dto.role_name ?? dto.roleName ?? '').trim();
    if (!roleName) throw new BadRequestException('角色名称不能为空');
    const id = Number(dto.id || 0);
    const menuCodes = Array.isArray(dto.menu_codes ?? dto.menuCodes)
      ? (dto.menu_codes ?? dto.menuCodes).join(',')
      : (dto.menu_codes ?? dto.menuCodes ?? '');

    if (id) {
      const role = await this.roleRepo.findOne({ where: { id, enterpriseId: entId } });
      if (!role) throw new NotFoundException('角色不存在');
      Object.assign(role, {
        roleName,
        roleCode: dto.role_code ?? dto.roleCode ?? role.roleCode,
        dataScope: Number(dto.data_scope ?? dto.dataScope ?? role.dataScope),
        menuCodes: menuCodes || role.menuCodes,
        remark: dto.remark ?? role.remark,
      });
      await this.roleRepo.save(role);
      return { id };
    }

    const saved = await this.roleRepo.save(
      this.roleRepo.create({
        enterpriseId: entId,
        roleName,
        roleCode: dto.role_code ?? dto.roleCode ?? `role_${Date.now()}`,
        dataScope: Number(dto.data_scope ?? dto.dataScope ?? 1),
        menuCodes,
        remark: dto.remark ?? '',
      }),
    );
    return { id: Number(saved.id) };
  }

  async roleList(entId: number) {
    const list = await this.roleRepo.find({ where: { enterpriseId: entId }, order: { id: 'ASC' } });
    return list.map((r) => ({
      id: Number(r.id),
      role_name: r.roleName,
      role_code: r.roleCode,
      data_scope: r.dataScope,
      data_scope_text: ['', '本人', '本部门', '全企业'][r.dataScope] || '本人',
      menu_codes: (r.menuCodes || '').split(',').filter(Boolean),
      remark: r.remark,
    }));
  }

  /** 角色权限保存：菜单权限 + 数据权限 */
  async saveRolePerm(entId: number, dto: any) {
    const id = Number(dto.role_id ?? dto.roleId ?? dto.id ?? 0);
    const role = await this.roleRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!role) throw new NotFoundException('角色不存在');
    const codes = dto.menu_codes ?? dto.menuCodes ?? [];
    role.menuCodes = Array.isArray(codes) ? codes.join(',') : String(codes);
    if (dto.data_scope ?? dto.dataScope) {
      role.dataScope = Number(dto.data_scope ?? dto.dataScope);
    }
    await this.roleRepo.save(role);
    return true;
  }

  async deleteRole(entId: number, id: number) {
    const role = await this.roleRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!role) throw new NotFoundException('角色不存在');
    const users = await this.userRepo.find({ where: { enterpriseId: entId } });
    const inUse = users.some((u) =>
      (u.roleIds || '').split(',').map((s) => s.trim()).includes(String(id)),
    );
    if (inUse) throw new BadRequestException('该角色已分配给员工，无法删除');
    await this.roleRepo.delete(id);
    return true;
  }

  /** 全部菜单树，供角色授权页勾选 */
  menuTree() {
    return MENU_TREE;
  }

  // ==================== 员工 ====================

  async saveUser(entId: number, dto: any, operator: AuthUser) {
    const username = (dto.username || '').trim();
    const id = Number(dto.id || 0);
    const roleIds = Array.isArray(dto.role_ids ?? dto.roleIds)
      ? (dto.role_ids ?? dto.roleIds).join(',')
      : (dto.role_ids ?? dto.roleIds ?? '');

    if (id) {
      const user = await this.userRepo.findOne({ where: { id, enterpriseId: entId } });
      if (!user) throw new NotFoundException('员工不存在');
      Object.assign(user, {
        deptId: Number(dto.dept_id ?? dto.deptId ?? user.deptId ?? 0),
        roleIds: roleIds || user.roleIds,
        realName: dto.real_name ?? dto.realName ?? user.realName,
        phone: dto.phone ?? user.phone,
        post: dto.post ?? user.post,
        isPartner: Number(dto.is_partner ?? dto.isPartner ?? user.isPartner ?? 0),
        status: Number(dto.status ?? user.status ?? 1),
      });
      const newPwd = dto.password;
      if (newPwd) user.password = await bcrypt.hash(newPwd, 10);
      await this.userRepo.save(user);
      return { id };
    }

    if (!username) throw new BadRequestException('登录账号不能为空');
    if (await this.userRepo.findOne({ where: { enterpriseId: entId, username } })) {
      throw new BadRequestException('该登录账号已存在');
    }
    const rawPwd = dto.password || '123456';
    const saved = await this.userRepo.save(
      this.userRepo.create({
        enterpriseId: entId,
        deptId: Number(dto.dept_id ?? dto.deptId ?? 0),
        roleIds,
        username,
        password: await bcrypt.hash(rawPwd, 10),
        realName: dto.real_name ?? dto.realName ?? username,
        phone: dto.phone ?? '',
        post: dto.post ?? '',
        isPartner: Number(dto.is_partner ?? dto.isPartner ?? 0),
        isSuper: 0,
        status: 1,
      }),
    );
    return { id: Number(saved.id), init_password: rawPwd, created_by: operator.userId };
  }

  async userPage(entId: number, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('u.enterpriseId = :entId', { entId })
      .orderBy('u.id', 'DESC')
      .skip(skip)
      .take(take);

    if (query.keyword) {
      qb.andWhere('(u.username LIKE :kw OR u.realName LIKE :kw OR u.phone LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    if (query.dept_id ?? query.deptId) {
      qb.andWhere('u.deptId = :deptId', { deptId: Number(query.dept_id ?? query.deptId) });
    }
    if (query.is_partner ?? query.isPartner) {
      qb.andWhere('u.isPartner = 1');
    }
    // 状态过滤：0 停用 / 1 启用，需显式判空避免 0 被当作未传
    const statusRaw = query.status ?? query.userStatus;
    if (statusRaw !== undefined && statusRaw !== null && statusRaw !== '') {
      qb.andWhere('u.status = :status', { status: Number(statusRaw) });
    }

    const [list, total] = await qb.getManyAndCount();
    const depts = await this.deptRepo.find({ where: { enterpriseId: entId } });
    const roles = await this.roleRepo.find({ where: { enterpriseId: entId } });
    const dMap = new Map(depts.map((d) => [Number(d.id), d.name]));
    const rMap = new Map(roles.map((r) => [Number(r.id), r.roleName]));

    return pageResult(
      list.map((u) => ({
        id: Number(u.id),
        username: u.username,
        real_name: u.realName,
        phone: u.phone,
        post: u.post,
        dept_id: Number(u.deptId || 0),
        dept_name: dMap.get(Number(u.deptId)) || '',
        role_ids: (u.roleIds || '').split(',').filter(Boolean).map(Number),
        role_names: (u.roleIds || '')
          .split(',')
          .filter(Boolean)
          .map((r) => rMap.get(Number(r)) || '')
          .filter(Boolean),
        is_partner: u.isPartner,
        is_super: u.isSuper,
        status: u.status,
        last_login_at: u.lastLoginAt,
        created_at: u.createdAt,
      })),
      total,
      page,
      size,
    );
  }

  /** 下拉用的简单员工列表 */
  async userOptions(entId: number) {
    const list = await this.userRepo.find({
      where: { enterpriseId: entId, status: 1 },
      order: { id: 'ASC' },
    });
    return list.map((u) => ({
      id: Number(u.id),
      real_name: u.realName || u.username,
      dept_id: Number(u.deptId || 0),
      is_partner: u.isPartner,
    }));
  }

  async deleteUser(entId: number, id: number, operator: AuthUser) {
    if (Number(id) === Number(operator.userId)) throw new BadRequestException('不能删除自己');
    const user = await this.userRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!user) throw new NotFoundException('员工不存在');
    if (user.isSuper) throw new BadRequestException('超级管理员账号不可删除');
    await this.userRepo.delete(id);
    return true;
  }

  /** 管理员重置员工密码 */
  async resetPassword(entId: number, id: number, password?: string) {
    const user = await this.userRepo.findOne({ where: { id, enterpriseId: entId } });
    if (!user) throw new NotFoundException('员工不存在');
    const pwd = password || '123456';
    await this.userRepo.update(id, { password: await bcrypt.hash(pwd, 10) });
    return { init_password: pwd };
  }
}
