import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CrmCustomer,
  Enterprise,
  ErpOrder,
  ErpStockWarn,
  PartnerConfig,
  PartnerPerformance,
  PartnerRisk,
  PartnerSettleFlow,
  PartnerSettleRule,
  SysUser,
} from '../../entities';
import { PartnerService } from './partner.service';
import { PartnerController } from './partner.controller';
import { NoticeModule } from '../notice/notice.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnerConfig,
      PartnerPerformance,
      PartnerRisk,
      PartnerSettleRule,
      PartnerSettleFlow,
      SysUser,
      CrmCustomer,
      ErpOrder,
      ErpStockWarn,
      Enterprise,
    ]),
    NoticeModule,
  ],
  providers: [PartnerService],
  controllers: [PartnerController],
  exports: [PartnerService],
})
export class PartnerModule {}
