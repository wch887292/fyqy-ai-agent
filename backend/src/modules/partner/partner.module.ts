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
  SysUser,
} from '../../entities';
import { PartnerService } from './partner.service';
import { PartnerController } from './partner.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnerConfig,
      PartnerPerformance,
      PartnerRisk,
      SysUser,
      CrmCustomer,
      ErpOrder,
      ErpStockWarn,
      Enterprise,
    ]),
  ],
  providers: [PartnerService],
  controllers: [PartnerController],
  exports: [PartnerService],
})
export class PartnerModule {}
