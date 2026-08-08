-- ==========================================================================
-- 飞虹智-企业AI一站式平台 V1.0 数据库初始化脚本 (MySQL 8.0)
-- 研发主体：晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
-- 项目负责人：吴赐虹
-- 强约束：所有业务表必须携带 enterprise_id，实现硬租户隔离
-- 说明：本脚本只负责建表；演示种子数据由后端启动时自动灌入（空库检测）
-- ==========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `fae_enterprise` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `fae_enterprise`;

-- ==========================================================================
-- 一、租户与组织
-- ==========================================================================

CREATE TABLE IF NOT EXISTS `enterprise` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '企业ID',
  `name` varchar(128) NOT NULL COMMENT '企业名称',
  `short_name` varchar(64) DEFAULT NULL COMMENT '企业简称',
  `industry` varchar(64) DEFAULT NULL COMMENT '所属行业',
  `contact_person` varchar(64) DEFAULT NULL COMMENT '联系人',
  `contact_phone` varchar(32) DEFAULT NULL COMMENT '联系电话',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '0禁用 1正常',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业租户主表';

CREATE TABLE IF NOT EXISTS `department` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL COMMENT '租户隔离字段',
  `name` varchar(64) NOT NULL COMMENT '部门名称',
  `parent_id` bigint NOT NULL DEFAULT 0 COMMENT '上级部门ID，0为顶级',
  `leader_user_id` bigint DEFAULT NULL COMMENT '部门负责人',
  `sort` int NOT NULL DEFAULT 0 COMMENT '排序号',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent` (`enterprise_id`),
  KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门表';

CREATE TABLE IF NOT EXISTS `sys_role` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `role_name` varchar(64) NOT NULL COMMENT '角色名称',
  `role_code` varchar(64) NOT NULL COMMENT '角色编码',
  `data_scope` tinyint NOT NULL DEFAULT 1 COMMENT '数据权限 1本人 2本部门 3全企业',
  `menu_codes` text COMMENT '菜单权限编码，逗号分隔',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent` (`enterprise_id`),
  UNIQUE KEY `idx_ent_code` (`enterprise_id`,`role_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

CREATE TABLE IF NOT EXISTS `sys_user` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `dept_id` bigint DEFAULT NULL,
  `role_ids` varchar(255) DEFAULT NULL COMMENT '多角色ID，逗号分隔',
  `username` varchar(64) NOT NULL COMMENT '登录账号',
  `password` varchar(128) NOT NULL COMMENT 'bcrypt 加密',
  `real_name` varchar(64) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `post` varchar(64) DEFAULT NULL COMMENT '岗位',
  `is_partner` tinyint NOT NULL DEFAULT 0 COMMENT '是否合伙人 0否 1是',
  `is_super` tinyint NOT NULL DEFAULT 0 COMMENT '是否平台超级管理员',
  `status` tinyint NOT NULL DEFAULT 1,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_ent_user` (`enterprise_id`,`username`),
  KEY `idx_dept` (`dept_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户员工表';

-- ==========================================================================
-- 二、AI 知识库（V1.0 核心卖点）
-- ==========================================================================

CREATE TABLE IF NOT EXISTS `kb_document` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `category` varchar(64) NOT NULL COMMENT 'system制度/product产品/script话术/train培训/contract合同',
  `title` varchar(255) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_path` varchar(512) DEFAULT NULL COMMENT '存储路径 local/minio',
  `file_size` bigint DEFAULT 0,
  `content` longtext COMMENT 'AI解析后的完整文本',
  `summary` text COMMENT 'AI生成摘要',
  `tag_list` varchar(512) DEFAULT NULL COMMENT 'AI生成标签，逗号分隔',
  `perm_scope` varchar(32) NOT NULL DEFAULT 'all' COMMENT 'all全员/dept指定部门/role指定角色',
  `perm_targets` varchar(512) DEFAULT NULL COMMENT '部门ID或角色ID列表，逗号分隔',
  `vector_status` tinyint NOT NULL DEFAULT 0 COMMENT '0待向量化 1完成 2失败',
  `chunk_count` int NOT NULL DEFAULT 0 COMMENT '切片数量',
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_cat` (`enterprise_id`,`category`),
  KEY `idx_vec_status` (`vector_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库文档主表';

CREATE TABLE IF NOT EXISTS `kb_chunk` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `doc_id` bigint NOT NULL,
  `chunk_index` int NOT NULL DEFAULT 0 COMMENT '切片序号',
  `content` text NOT NULL COMMENT '切片文本',
  `embedding` longtext COMMENT 'memory模式下存向量JSON；milvus模式下为空',
  `vector_id` varchar(64) DEFAULT NULL COMMENT 'Milvus 主键',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_doc` (`enterprise_id`,`doc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库切片与向量表';

CREATE TABLE IF NOT EXISTS `kb_chat_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `question` text NOT NULL,
  `answer` longtext,
  `ref_docs` text COMMENT '引用文档JSON',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_user` (`enterprise_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI问答会话历史';

-- ==========================================================================
-- 三、AI-CRM 销售模块（字段严格遵循产品规范）
-- ==========================================================================

CREATE TABLE IF NOT EXISTS `crm_customer` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `company_name` varchar(255) DEFAULT NULL COMMENT '公司名称',
  `customer_name` varchar(128) NOT NULL COMMENT '客户姓名',
  `phone` varchar(32) DEFAULT NULL COMMENT '联系电话',
  `contact_time` datetime DEFAULT NULL COMMENT '联系时间，服务器实时写入',
  `remark` text COMMENT '备注',
  `tags` varchar(512) DEFAULT NULL COMMENT '客户标签',
  `grade` varchar(16) DEFAULT 'C' COMMENT 'AI客户分级 A高意向/B潜客/C普通/D沉睡',
  `intention_score` int NOT NULL DEFAULT 0 COMMENT 'AI意向打分 0-100',
  `ai_analysis` text COMMENT 'AI意向分析说明',
  `owner_user_id` bigint DEFAULT NULL COMMENT '归属销售',
  `dept_id` bigint DEFAULT NULL COMMENT '归属部门，用于数据权限',
  `is_public` tinyint NOT NULL DEFAULT 0 COMMENT '是否公海客户',
  `last_follow_time` datetime DEFAULT NULL COMMENT '最后跟进时间',
  `next_follow_time` datetime DEFAULT NULL COMMENT '下次跟进时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_owner` (`enterprise_id`,`owner_user_id`),
  KEY `idx_ent_public` (`enterprise_id`,`is_public`),
  KEY `idx_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户主表';

CREATE TABLE IF NOT EXISTS `crm_follow` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `customer_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `follow_type` varchar(32) NOT NULL COMMENT '电话/微信/拜访/其他',
  `content` text NOT NULL,
  `next_follow_time` datetime DEFAULT NULL,
  `ai_suggest` text COMMENT 'AI跟进建议与话术',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cust` (`customer_id`),
  KEY `idx_ent_user` (`enterprise_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户跟进记录';

CREATE TABLE IF NOT EXISTS `crm_daily_report` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `report_date` date NOT NULL,
  `call_cnt` int NOT NULL DEFAULT 0 COMMENT '电话量',
  `wechat_add_cnt` int NOT NULL DEFAULT 0 COMMENT '微信添加',
  `intention_cust_cnt` int NOT NULL DEFAULT 0 COMMENT '新增意向客户',
  `visit_cnt` int NOT NULL DEFAULT 0 COMMENT '约拜访/面访',
  `experience` text COMMENT '今日心得体会',
  `tomorrow_plan` text COMMENT '明日工作计划',
  `ai_auto_content` text COMMENT 'AI自动生成日报内容',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_uid_date` (`user_id`,`report_date`),
  KEY `idx_ent_date` (`enterprise_id`,`report_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售日报（固定模板）';

-- ==========================================================================
-- 四、轻量 AI-ERP
-- ==========================================================================

CREATE TABLE IF NOT EXISTS `erp_product` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `product_code` varchar(64) DEFAULT NULL COMMENT '产品编码',
  `product_name` varchar(255) NOT NULL,
  `spec` varchar(255) DEFAULT NULL COMMENT '规格型号',
  `unit` varchar(16) DEFAULT '件' COMMENT '单位',
  `price` decimal(12,2) NOT NULL DEFAULT 0.00 COMMENT '销售单价',
  `cost_price` decimal(12,2) NOT NULL DEFAULT 0.00 COMMENT '成本价',
  `stock_num` int NOT NULL DEFAULT 0 COMMENT '当前库存',
  `warn_stock` int NOT NULL DEFAULT 0 COMMENT '预警库存',
  `status` tinyint NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent` (`enterprise_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='产品档案';

CREATE TABLE IF NOT EXISTS `erp_stock_record` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `type` varchar(16) NOT NULL COMMENT 'in入库 / out出库',
  `num` int NOT NULL COMMENT '数量',
  `before_num` int NOT NULL DEFAULT 0 COMMENT '变动前库存',
  `after_num` int NOT NULL DEFAULT 0 COMMENT '变动后库存',
  `biz_type` varchar(32) DEFAULT 'manual' COMMENT 'manual手工/order订单出库/produce工单入库',
  `biz_id` bigint DEFAULT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `operator_id` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_prod` (`enterprise_id`,`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='出入库流水';

CREATE TABLE IF NOT EXISTS `erp_stock_warn` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `stock_num` int NOT NULL,
  `warn_stock` int NOT NULL,
  `ai_advice` text COMMENT 'AI补货建议',
  `handled` tinyint NOT NULL DEFAULT 0 COMMENT '0未处理 1已处理',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_handled` (`enterprise_id`,`handled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存缺货预警记录';

CREATE TABLE IF NOT EXISTS `erp_order` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `order_no` varchar(64) NOT NULL COMMENT '订单号',
  `customer_id` bigint NOT NULL,
  `customer_name` varchar(128) DEFAULT NULL COMMENT '冗余客户名，便于列表展示',
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `order_status` varchar(32) NOT NULL DEFAULT '待审核' COMMENT '待审核/生产中/已发货/已完成/已取消',
  `owner_user_id` bigint DEFAULT NULL COMMENT '业务归属人',
  `delivery_date` date DEFAULT NULL COMMENT '交期',
  `ai_warn_msg` text COMMENT 'AI异常预警信息',
  `remark` varchar(512) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_orderno` (`order_no`),
  KEY `idx_ent_status` (`enterprise_id`,`order_status`),
  KEY `idx_cust` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售订单主表';

CREATE TABLE IF NOT EXISTS `erp_order_item` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `order_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `product_name` varchar(255) DEFAULT NULL,
  `spec` varchar(255) DEFAULT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `num` int NOT NULL DEFAULT 0,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`),
  KEY `idx_ent` (`enterprise_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售订单明细';

-- ==========================================================================
-- 五、合伙人管理（分权、分利、分风险 V1.0 基础）
-- ==========================================================================

CREATE TABLE IF NOT EXISTS `partner_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `user_id` bigint NOT NULL COMMENT '合伙人用户ID',
  `partner_type` varchar(32) DEFAULT '业务合伙人' COMMENT '业务/生产/资源/事业合伙人',
  `data_scope` tinyint NOT NULL DEFAULT 1 COMMENT '1本人 2本部门 3全企业',
  `menu_codes` text COMMENT '可访问菜单编码，逗号分隔',
  `default_ratio` decimal(5,2) NOT NULL DEFAULT 0.00 COMMENT '默认分成比例%',
  `enable` tinyint NOT NULL DEFAULT 1,
  `remark` varchar(512) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_ent_user` (`enterprise_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合伙人分权配置';

CREATE TABLE IF NOT EXISTS `partner_performance` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `user_id` bigint NOT NULL COMMENT '合伙人用户ID',
  `order_id` bigint DEFAULT NULL,
  `order_no` varchar(64) DEFAULT NULL,
  `performance_amount` decimal(12,2) NOT NULL DEFAULT 0.00 COMMENT '业绩金额',
  `ratio` decimal(5,2) NOT NULL DEFAULT 0.00 COMMENT '分成比例%',
  `estimate_amount` decimal(12,2) NOT NULL DEFAULT 0.00 COMMENT '预估分成金额（V1.0仅台账登记，不做实发）',
  `period` varchar(16) DEFAULT NULL COMMENT '归属期间 YYYY-MM',
  `remark` varchar(512) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_uid` (`enterprise_id`,`user_id`),
  KEY `idx_period` (`period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合伙人业绩归属台账';

CREATE TABLE IF NOT EXISTS `partner_risk` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `user_id` bigint NOT NULL COMMENT '风险归属合伙人',
  `risk_type` varchar(32) NOT NULL COMMENT 'follow_overdue跟进逾期/order_abnormal订单异常/stock_warn库存',
  `biz_id` bigint DEFAULT NULL,
  `risk_level` varchar(16) DEFAULT '中' COMMENT '高/中/低',
  `content` text NOT NULL COMMENT '风险描述',
  `ai_advice` text COMMENT 'AI处置建议',
  `handled` tinyint NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_uid` (`enterprise_id`,`user_id`),
  KEY `idx_handled` (`handled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合伙人风险预警记录';

-- ==========================================================================
-- 六、系统配置与日志
-- ==========================================================================

CREATE TABLE IF NOT EXISTS `sys_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL,
  `config_key` varchar(64) NOT NULL COMMENT 'ai_endpoint/ai_key/ai_model 等',
  `config_value` text,
  `remark` varchar(255) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_ent_key` (`enterprise_id`,`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业级系统配置（含OpenClaw大模型参数）';

CREATE TABLE IF NOT EXISTS `sys_oper_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `enterprise_id` bigint NOT NULL DEFAULT 0,
  `user_id` bigint DEFAULT NULL,
  `username` varchar(64) DEFAULT NULL,
  `module` varchar(64) DEFAULT NULL,
  `action` varchar(128) DEFAULT NULL,
  `method` varchar(16) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `params` text,
  `success` tinyint NOT NULL DEFAULT 1,
  `error_msg` text,
  `cost_ms` int DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_time` (`enterprise_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志';

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================================================
-- 建表完成。V1.0 共 18 张表：
-- 租户组织4 / 知识库3 / CRM3 / ERP5 / 合伙人3 / 系统2  （合计 20 项含索引表）
-- 演示种子数据由后端 BootstrapService 在检测到空库时自动写入
-- ==========================================================================
