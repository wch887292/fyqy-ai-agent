import { Enterprise, Department, SysRole, SysUser } from './org.entity';
import { KbDocument, KbChunk, KbChatHistory, KbDocVersion } from './kb.entity';
import { CrmCustomer, CrmFollow, CrmDailyReport } from './crm.entity';
import { ErpProduct, ErpStockRecord, ErpStockWarn, ErpOrder, ErpOrderItem } from './erp.entity';
import {
  PartnerConfig,
  PartnerPerformance,
  PartnerRisk,
  PartnerSettleRule,
  PartnerSettleFlow,
} from './partner.entity';
import { SysConfig, SysOperLog } from './system.entity';
import { AgentTask, AgentExecLog, AgentSimple, AgentAdvanced, AgentAdvancedNode, AgentExecRecord } from './agent.entity';
import { ProdWorkOrder } from './prod.entity';
import { SysNotice } from './notice.entity';

export * from './org.entity';
export * from './kb.entity';
export * from './crm.entity';
export * from './erp.entity';
export * from './partner.entity';
export * from './system.entity';
export * from './agent.entity';
export * from './prod.entity';
export * from './notice.entity';

/** 全部实体清单，供 TypeORM 注册 */
export const ALL_ENTITIES = [
  Enterprise,
  Department,
  SysRole,
  SysUser,
  KbDocument,
  KbChunk,
  KbChatHistory,
  KbDocVersion,
  CrmCustomer,
  CrmFollow,
  CrmDailyReport,
  ErpProduct,
  ErpStockRecord,
  ErpStockWarn,
  ErpOrder,
  ErpOrderItem,
  PartnerConfig,
  PartnerPerformance,
  PartnerRisk,
  PartnerSettleRule,
  PartnerSettleFlow,
  SysConfig,
  SysOperLog,
  AgentTask,
  AgentExecLog,
  AgentSimple,
  AgentAdvanced,
  AgentAdvancedNode,
  AgentExecRecord,
  ProdWorkOrder,
  SysNotice,
];
