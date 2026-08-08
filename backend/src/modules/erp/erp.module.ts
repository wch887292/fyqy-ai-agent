import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CrmCustomer,
  ErpOrder,
  ErpOrderItem,
  ErpProduct,
  ErpStockRecord,
  ErpStockWarn,
  PartnerConfig,
  PartnerPerformance,
  SysUser,
} from '../../entities';
import { ErpService } from './erp.service';
import { ErpController } from './erp.controller';
import { OrgModule } from '../org/org.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ErpProduct,
      ErpStockRecord,
      ErpStockWarn,
      ErpOrder,
      ErpOrderItem,
      CrmCustomer,
      SysUser,
      PartnerConfig,
      PartnerPerformance,
    ]),
    OrgModule,
  ],
  providers: [ErpService],
  controllers: [ErpController],
  exports: [ErpService],
})
export class ErpModule {}
