import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import {
  CrmCustomer,
  ErpOrder,
  ErpOrderItem,
  ProdWorkOrder,
  SysUser,
} from '../../entities';
import { CommonService } from './common.service';
import { CommonController } from './common.controller';
import { OrgModule } from '../org/org.module';
import { KbModule } from '../kb/kb.module';

/**
 * V2.0 批量导入导出模块
 * 文件走内存存储，单文件上限 50MB（与知识库上传保持一致）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CrmCustomer, ErpOrder, ErpOrderItem, ProdWorkOrder, SysUser]),
    MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } }),
    OrgModule,
    KbModule,
  ],
  providers: [CommonService],
  controllers: [CommonController],
  exports: [CommonService],
})
export class CommonBizModule {}
