-- ==========================================================
-- 飞虹智-企业AI一站式平台 V2.0 数据库增量 DDL（MySQL 8.0）
-- 研发主体：晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
--
-- 适用场景：V1.0 已部署 + 升级到 V2.0，运行本脚本补齐新增表与列。
-- 幂等设计：全部使用 CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS，
--           重复执行不会报错，生产升级可直接执行。
-- ==========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
USE `fae_enterprise`;

-- ==========================================================================
-- 一、V2.0 新增表
-- ==========================================================================

-- 站内消息通知（V2.0）
CREATE TABLE IF NOT EXISTS `sys_notice` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '消息ID',
  `enterprise_id` bigint NOT NULL COMMENT '租户隔离字段',
  `receive_user_id` bigint NOT NULL COMMENT '接收人用户ID',
  `title` varchar(255) NOT NULL COMMENT '消息标题',
  `content` text NOT NULL COMMENT '消息正文',
  `biz_type` varchar(64) DEFAULT NULL COMMENT '业务类型：crm客户/erp订单/prod工单/partner分利/warn风险/agent智能体',
  `biz_id` bigint DEFAULT 0 COMMENT '业务ID（与 biz_type 对应）',
  `is_read` tinyint NOT NULL DEFAULT 0 COMMENT '0未读 1已读',
  `created_by` bigint DEFAULT 0 COMMENT '消息创建人ID（系统发送时为0）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_user_read` (`enterprise_id`,`receive_user_id`,`is_read`),
  KEY `idx_ent_biz` (`enterprise_id`,`biz_type`,`biz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内消息通知表';

-- OpenClaw 智能体任务配置（V2.0）
CREATE TABLE IF NOT EXISTS `agent_task` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '任务ID',
  `enterprise_id` bigint NOT NULL COMMENT '租户隔离字段',
  `agent_name` varchar(128) NOT NULL COMMENT '智能体名称',
  `trigger_type` varchar(32) NOT NULL DEFAULT 'cron' COMMENT '触发方式：cron定时/event事件',
  `cron_expr` varchar(64) DEFAULT NULL COMMENT 'Quartz 表达式（仅 trigger_type=cron 时使用）',
  `enable` tinyint NOT NULL DEFAULT 1 COMMENT '0禁用 1启用',
  `biz_prompt` text NOT NULL COMMENT '业务指令 prompt',
  `template_key` varchar(48) DEFAULT NULL COMMENT '模板标识：sales_assistant/risk_inspection/kb_inspection/order_workorder',
  `last_execute_time` datetime DEFAULT NULL COMMENT '上次执行时间',
  `created_by` bigint NOT NULL DEFAULT 0 COMMENT '创建人ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_enable` (`enterprise_id`,`enable`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能体任务配置表';

-- OpenClaw 智能体执行日志（V2.0）
CREATE TABLE IF NOT EXISTS `agent_exec_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `enterprise_id` bigint NOT NULL COMMENT '租户隔离字段',
  `task_id` bigint NOT NULL COMMENT '关联任务ID',
  `execute_status` varchar(32) NOT NULL DEFAULT 'running' COMMENT 'running/success/fail',
  `trigger_source` varchar(32) NOT NULL DEFAULT 'manual' COMMENT '手动/cron/事件',
  `input_param` text COMMENT '输入参数 JSON',
  `agent_output` longtext COMMENT '执行输出摘要',
  `error_msg` text COMMENT '异常信息',
  `start_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '执行开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '执行结束时间',
  PRIMARY KEY (`id`),
  KEY `idx_taskid` (`task_id`),
  KEY `idx_ent_start` (`enterprise_id`,`start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能体执行日志表';

-- 简易生产工单（V2.0）
CREATE TABLE IF NOT EXISTS `prod_work_order` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '工单ID',
  `enterprise_id` bigint NOT NULL COMMENT '租户隔离字段',
  `order_id` bigint NOT NULL DEFAULT 0 COMMENT '关联销售订单ID，0 表示手工创建',
  `work_no` varchar(64) NOT NULL COMMENT '工单号 WO + 时间戳',
  `product_id` bigint NOT NULL COMMENT '产品ID',
  `product_name` varchar(255) DEFAULT NULL COMMENT '产品名称（快照，防止产品改名后丢失）',
  `produce_num` int NOT NULL DEFAULT 0 COMMENT '计划生产数量',
  `finish_num` int NOT NULL DEFAULT 0 COMMENT '已完工数量',
  `status` varchar(32) NOT NULL DEFAULT '待排产' COMMENT '待排产/生产中/部分完成/全部完工/已取消',
  `plan_finish_time` datetime DEFAULT NULL COMMENT '计划完工时间',
  `actual_finish_time` datetime DEFAULT NULL COMMENT '实际完工时间',
  `ai_tip` text COMMENT 'AI 工期与缺料提示',
  `owner_user_id` bigint DEFAULT NULL COMMENT '生产负责人ID',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_status` (`enterprise_id`,`status`),
  KEY `idx_ent_order` (`enterprise_id`,`order_id`),
  UNIQUE KEY `idx_work_no` (`work_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='简易生产工单表';

-- 合伙人分利规则（V2.0）
CREATE TABLE IF NOT EXISTS `partner_settle_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '规则ID',
  `enterprise_id` bigint NOT NULL COMMENT '租户隔离字段',
  `user_id` bigint NOT NULL COMMENT '合伙人用户ID',
  `settle_type` varchar(32) NOT NULL COMMENT '结算模式：order按订单/performance按业绩',
  `ratio` decimal(5,2) NOT NULL DEFAULT 0 COMMENT '分成比例 %',
  `settle_condition` text COMMENT '结算条件 JSON（如 {"min_amount":1000}，为空表示无门槛）',
  `enable` tinyint NOT NULL DEFAULT 1 COMMENT '0禁用 1启用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_user_type` (`enterprise_id`,`user_id`,`settle_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合伙人分利规则表';

-- 合伙人分利结算流水（V2.0）
CREATE TABLE IF NOT EXISTS `partner_settle_flow` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '流水ID',
  `enterprise_id` bigint NOT NULL COMMENT '租户隔离字段',
  `user_id` bigint NOT NULL COMMENT '合伙人用户ID',
  `order_id` bigint DEFAULT 0 COMMENT '关联订单ID，0 表示非订单来源',
  `performance_id` bigint DEFAULT 0 COMMENT '关联业绩台账ID',
  `base_amount` decimal(12,2) NOT NULL DEFAULT 0 COMMENT '计算基数（订单总额 / 业绩金额）',
  `settle_amount` decimal(12,2) NOT NULL DEFAULT 0 COMMENT '结算金额 = 基数 × 比例',
  `settle_type` varchar(32) NOT NULL COMMENT 'order / performance，防幂等重复核算',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending待结算/settled已结算/cancel作废',
  `settle_time` datetime DEFAULT NULL COMMENT '结算确认时间',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_uid` (`enterprise_id`,`user_id`),
  KEY `idx_ent_status` (`enterprise_id`,`status`),
  KEY `idx_ent_settle_type` (`enterprise_id`,`settle_type`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合伙人分利结算流水表';

-- ==========================================================================
-- 二、V2.0 新增列（存量表增量补齐）
-- ==========================================================================

-- 知识库文档：AI 生成摘要字段（V2.0 新增，部分旧库可能已存在）
ALTER TABLE `kb_document`
  ADD COLUMN IF NOT EXISTS `summary` text COMMENT 'AI 生成摘要' AFTER `content`;

-- 知识库文档：AI 生成标签字段（V2.0 新增）
ALTER TABLE `kb_document`
  ADD COLUMN IF NOT EXISTS `tag_list` varchar(512) DEFAULT NULL COMMENT 'AI 生成标签（逗号分隔）' AFTER `summary`;

-- 知识库问答会话历史（V2.0 新增）
CREATE TABLE IF NOT EXISTS `kb_chat_history` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '会话ID',
  `enterprise_id` bigint NOT NULL COMMENT '租户隔离字段',
  `user_id` bigint NOT NULL COMMENT '发起用户ID',
  `question` text NOT NULL COMMENT '用户问题',
  `answer` longtext COMMENT 'AI 回答内容',
  `ref_docs` text COMMENT '引用文档 JSON：[{id, title, score}]',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ent_user` (`enterprise_id`,`user_id`),
  KEY `idx_ent_created` (`enterprise_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库问答会话历史表';

-- 知识库文档版本快照（V2.0 新增）
CREATE TABLE IF NOT EXISTS `kb_doc_version` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '版本ID',
  `enterprise_id` bigint NOT NULL COMMENT '租户隔离字段',
  `doc_id` bigint NOT NULL COMMENT '关联文档ID',
  `version_no` int NOT NULL DEFAULT 1 COMMENT '版本号，从 1 开始递增',
  `title` varchar(255) NOT NULL COMMENT '文档标题（快照）',
  `content` longtext COMMENT '文档正文（快照）',
  `summary` text COMMENT '摘要快照',
  `tag_list` varchar(512) DEFAULT NULL COMMENT '标签快照',
  `created_by` bigint NOT NULL DEFAULT 0 COMMENT '操作人ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_ver` (`doc_id`,`version_no`),
  KEY `idx_ent_doc` (`enterprise_id`,`doc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库文档版本快照表';

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================================================
-- 三、幂等菜单权限升级（V2.0 新增的菜单码）
-- ==========================================================================
-- 在系统设置界面「角色与权限」里，进入「企业管理员」与「超级管理员」角色，
-- 将以下菜单码补充到 menu_codes 字段（逗号分隔），或直接执行下面语句：
--   UPDATE sys_role SET menu_codes = CONCAT(
--     IF(INSTR(menu_codes, 'prod:workorder') = 0, IF(menu_codes='', '', CONCAT(menu_codes, ',')), ''),
--     'prod:workorder,',
--     IF(INSTR(menu_codes, 'agent:task') = 0, IF(menu_codes='', '', CONCAT(menu_codes, ',')), ''),
--     'agent:task,',
--     IF(INSTR(menu_codes, 'agent:log') = 0, IF(menu_codes='', '', CONCAT(menu_codes, ',')), ''),
--     'agent:log,',
--     IF(INSTR(menu_codes, 'partner:rule') = 0, IF(menu_codes='', '', CONCAT(menu_codes, ',')), ''),
--     'partner:rule,',
--     IF(INSTR(menu_codes, 'partner:settle') = 0, IF(menu_codes='', '', CONCAT(menu_codes, ',')), ''),
--     'partner:settle'
--   )
--   WHERE enterprise_id = <你的企业ID>
--     AND role_code IN ('super_admin', 'ent_admin');
