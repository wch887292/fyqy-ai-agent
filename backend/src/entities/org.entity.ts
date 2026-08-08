import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { T, bigintCol, numericTransformer } from '../common/db-types';

/** 企业租户主表 */
@Entity('enterprise')
export class Enterprise {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ length: 128, comment: '企业名称' })
  name: string;

  @Column({ name: 'short_name', length: 64, nullable: true })
  shortName: string;

  @Column({ length: 64, nullable: true, comment: '所属行业' })
  industry: string;

  @Column({ name: 'contact_person', length: 64, nullable: true })
  contactPerson: string;

  @Column({ name: 'contact_phone', length: 32, nullable: true })
  contactPhone: string;

  @Column({ type: 'tinyint', default: 1, comment: '0禁用 1正常' })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** 部门表 */
@Entity('department')
@Index('idx_ent', ['enterpriseId'])
export class Department {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ length: 64 })
  name: string;

  @Column({ name: 'parent_id', type: T.bigint, default: 0, transformer: numericTransformer })
  parentId: number;

  @Column({ name: 'leader_user_id', ...bigintCol() })
  leaderUserId: number;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** 角色表 */
@Entity('sys_role')
@Index('idx_role_ent', ['enterpriseId'])
export class SysRole {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'role_name', length: 64 })
  roleName: string;

  @Column({ name: 'role_code', length: 64 })
  roleCode: string;

  @Column({ name: 'data_scope', type: 'tinyint', default: 1, comment: '1本人 2本部门 3全企业' })
  dataScope: number;

  @Column({ name: 'menu_codes', type: T.text, nullable: true, comment: '菜单权限编码，逗号分隔' })
  menuCodes: string;

  @Column({ length: 255, nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** 用户员工表 */
@Entity('sys_user')
@Index('idx_user_ent', ['enterpriseId'])
export class SysUser {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'dept_id', ...bigintCol() })
  deptId: number;

  @Column({ name: 'role_ids', length: 255, nullable: true, comment: '多角色ID，逗号分隔' })
  roleIds: string;

  @Column({ length: 64 })
  username: string;

  @Column({ length: 128, select: false, comment: 'bcrypt 加密' })
  password: string;

  @Column({ name: 'real_name', length: 64, nullable: true })
  realName: string;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ length: 64, nullable: true, comment: '岗位' })
  post: string;

  @Column({ name: 'is_partner', type: 'tinyint', default: 0 })
  isPartner: number;

  @Column({ name: 'is_super', type: 'tinyint', default: 0 })
  isSuper: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'last_login_at', type: T.datetime, nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
