import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CrmCustomer,
  CrmFollow,
  Department,
  Enterprise,
  ErpOrder,
  ErpOrderItem,
  ErpProduct,
  ErpStockRecord,
  ErpStockWarn,
  KbDocument,
  PartnerConfig,
  PartnerPerformance,
  SysRole,
  SysUser,
} from '../../entities';
import { SeedService } from './seed.service';
import { OrgModule } from '../org/org.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Enterprise,
      Department,
      SysRole,
      SysUser,
      CrmCustomer,
      CrmFollow,
      ErpProduct,
      ErpStockRecord,
      ErpStockWarn,
      ErpOrder,
      ErpOrderItem,
      KbDocument,
      PartnerConfig,
      PartnerPerformance,
    ]),
    OrgModule,
    AiModule,
  ],
  providers: [SeedService],
})
export class SeedModule {}
