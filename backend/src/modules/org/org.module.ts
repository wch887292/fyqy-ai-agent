import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department, Enterprise, SysRole, SysUser } from '../../entities';
import { OrgService } from './org.service';
import {
  DeptController,
  EnterpriseController,
  RoleController,
  UserController,
} from './org.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Enterprise, Department, SysRole, SysUser])],
  providers: [OrgService],
  controllers: [EnterpriseController, DeptController, RoleController, UserController],
  exports: [OrgService],
})
export class OrgModule {}
