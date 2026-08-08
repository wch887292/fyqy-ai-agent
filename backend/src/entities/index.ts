import { Enterprise, Department, SysRole, SysUser } from './org.entity';
import { KbDocument, KbChunk, KbChatHistory } from './kb.entity';
import { CrmCustomer, CrmFollow, CrmDailyReport } from './crm.entity';
import { ErpProduct, ErpStockRecord, ErpStockWarn, ErpOrder, ErpOrderItem } from './erp.entity';
import { PartnerConfig, PartnerPerformance, PartnerRisk } from './partner.entity';
import { SysConfig, SysOperLog } from './system.entity';

export * from './org.entity';
export * from './kb.entity';
export * from './crm.entity';
export * from './erp.entity';
export * from './partner.entity';
export * from './system.entity';

/** 全部实体清单，供 TypeORM 注册 */
export const ALL_ENTITIES = [
  Enterprise,
  Department,
  SysRole,
  SysUser,
  KbDocument,
  KbChunk,
  KbChatHistory,
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
  SysConfig,
  SysOperLog,
];
