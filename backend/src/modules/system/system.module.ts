import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enterprise, SysConfig, SysOperLog, SysUser } from '../../entities';
import { SystemService } from './system.service';
import { HealthController, SystemController } from './system.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SysConfig, SysOperLog, Enterprise, SysUser])],
  providers: [SystemService],
  controllers: [HealthController, SystemController],
  exports: [SystemService],
})
export class SystemModule {}
