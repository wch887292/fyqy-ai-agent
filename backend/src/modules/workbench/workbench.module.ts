import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CrmCustomer,
  CrmDailyReport,
  CrmFollow,
  ErpOrder,
  ErpProduct,
  ErpStockWarn,
  KbDocument,
  PartnerRisk,
  SysConfig,
  SysUser,
} from '../../entities';
import { WorkbenchService } from './workbench.service';
import { WorkbenchController } from './workbench.controller';
import { OrgModule } from '../org/org.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CrmCustomer,
      CrmFollow,
      CrmDailyReport,
      ErpOrder,
      ErpProduct,
      ErpStockWarn,
      KbDocument,
      PartnerRisk,
      SysUser,
      SysConfig,
    ]),
    OrgModule,
  ],
  providers: [WorkbenchService],
  controllers: [WorkbenchController],
  exports: [WorkbenchService],
})
export class WorkbenchModule {}
