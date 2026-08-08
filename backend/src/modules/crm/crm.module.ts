import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrmCustomer, CrmDailyReport, CrmFollow, SysUser } from '../../entities';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { AiModule } from '../ai/ai.module';
import { OrgModule } from '../org/org.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CrmCustomer, CrmFollow, CrmDailyReport, SysUser]),
    AiModule,
    OrgModule,
  ],
  providers: [CrmService],
  controllers: [CrmController],
  exports: [CrmService],
})
export class CrmModule {}
