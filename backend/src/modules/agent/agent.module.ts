import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AgentExecLog,
  AgentTask,
  CrmCustomer,
  CrmFollow,
  ErpOrder,
  ErpOrderItem,
  ErpProduct,
  KbDocument,
  ProdWorkOrder,
  SysRole,
  SysUser,
} from '../../entities';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AgentRunnerService } from './agent.runner';
import { NoticeModule } from '../notice/notice.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentTask,
      AgentExecLog,
      CrmCustomer,
      CrmFollow,
      ErpOrder,
      ErpOrderItem,
      ErpProduct,
      KbDocument,
      ProdWorkOrder,
      SysRole,
      SysUser,
    ]),
    NoticeModule,
  ],
  providers: [AgentService, AgentRunnerService],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
