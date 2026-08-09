-- ============================================================
-- AI智能体搭建 V3.0 DDL 脚本
-- 飞虹智-企业AI一站式平台
-- 创建时间: 2026-08-08
-- ============================================================

-- 1. 简易智能体表
CREATE TABLE IF NOT EXISTS `agent_simple` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `enterprise_id` BIGINT UNSIGNED NOT NULL COMMENT '企业ID',
  `agent_type` VARCHAR(32) NOT NULL DEFAULT 'simple' COMMENT '智能体类型: simple|advanced',
  `agent_name` VARCHAR(128) NOT NULL COMMENT '智能体名称',
  `avatar` VARCHAR(256) DEFAULT NULL COMMENT '智能体头像URL',
  `persona` TEXT DEFAULT NULL COMMENT '角色设定/人设描述',
  `system_prompt` TEXT NOT NULL COMMENT '系统提示词',
  `kb_doc_ids` TEXT DEFAULT NULL COMMENT '关联知识库文档ID(逗号分隔)',
  `answer_style` VARCHAR(32) NOT NULL DEFAULT 'detailed' COMMENT '回答风格: concise|detailed|friendly|professional',
  `temperature` FLOAT NOT NULL DEFAULT 0.7 COMMENT '温度参数0~1',
  `max_tokens` INT NOT NULL DEFAULT 2048 COMMENT '最大Token数',
  `show_refs` TINYINT NOT NULL DEFAULT 1 COMMENT '是否显示引用: 0否1是',
  `access_pwd` VARCHAR(64) DEFAULT NULL COMMENT '访问密码(空则公开)',
  `enable` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用: 0禁用1启用',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '创建人ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ent_simple_type` (`enterprise_id`, `agent_type`),
  KEY `idx_ent_simple_name` (`enterprise_id`, `agent_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='简易智能体配置';

-- 2. 高级智能体工作流表
CREATE TABLE IF NOT EXISTS `agent_advanced` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `enterprise_id` BIGINT UNSIGNED NOT NULL COMMENT '企业ID',
  `agent_type` VARCHAR(32) NOT NULL DEFAULT 'advanced' COMMENT '智能体类型: simple|advanced',
  `agent_name` VARCHAR(128) NOT NULL COMMENT '智能体名称',
  `avatar` VARCHAR(256) DEFAULT NULL COMMENT '智能体头像URL',
  `description` TEXT DEFAULT NULL COMMENT '工作流描述',
  `input_questions` TEXT DEFAULT NULL COMMENT '入口问题预设(JSON数组)',
  `enable_q_optimize` TINYINT NOT NULL DEFAULT 1 COMMENT '是否开启问题优化: 0否1是',
  `enable_safety` TINYINT NOT NULL DEFAULT 1 COMMENT '是否开启敏感词过滤: 0否1是',
  `sensitive_words` TEXT DEFAULT NULL COMMENT '敏感词列表(逗号分隔)',
  `kb_doc_ids` TEXT DEFAULT NULL COMMENT '关联知识库文档ID(逗号分隔)',
  `enable` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用: 0禁用1启用',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '创建人ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ent_adv_type` (`enterprise_id`, `agent_type`),
  KEY `idx_ent_adv_name` (`enterprise_id`, `agent_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='高级智能体工作流配置';

-- 3. 高级智能体工作流节点表
CREATE TABLE IF NOT EXISTS `agent_advanced_node` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `flow_id` BIGINT UNSIGNED NOT NULL COMMENT '工作流ID(关联agent_advanced.id)',
  `node_type` VARCHAR(32) NOT NULL COMMENT '节点类型: input|filter|llm|kb_search|function_call|output',
  `node_name` VARCHAR(128) NOT NULL COMMENT '节点名称',
  `node_config` TEXT NOT NULL COMMENT '节点配置(JSON)',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序权重',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '创建人ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_adv_node_flow` (`flow_id`),
  KEY `idx_adv_node_type` (`flow_id`, `node_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='高级智能体工作流节点';

-- 4. 智能体问答执行记录表
CREATE TABLE IF NOT EXISTS `agent_exec_record` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `enterprise_id` BIGINT UNSIGNED NOT NULL COMMENT '企业ID',
  `agent_id` BIGINT UNSIGNED NOT NULL COMMENT '智能体ID',
  `agent_type` VARCHAR(32) NOT NULL COMMENT '智能体类型: simple|advanced',
  `question` TEXT NOT NULL COMMENT '用户问题',
  `answer` LONGTEXT NOT NULL COMMENT 'AI回答',
  `refs` TEXT DEFAULT NULL COMMENT '引用的知识库片段(JSON数组)',
  `cost_ms` INT NOT NULL DEFAULT 0 COMMENT '耗时毫秒',
  `exec_status` VARCHAR(32) NOT NULL DEFAULT 'success' COMMENT '执行状态: success|fail',
  `error_msg` TEXT DEFAULT NULL COMMENT '错误信息',
  `created_by` BIGINT UNSIGNED DEFAULT NULL COMMENT '创建人ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_exec_agent` (`agent_id`),
  KEY `idx_exec_ent_time` (`enterprise_id`, `created_at`),
  KEY `idx_exec_type` (`agent_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能体问答执行记录';

-- ============================================================
-- 初始化示例数据（可选）
-- ============================================================

-- 示例：创建一个简易智能体（客服助手）
-- INSERT INTO `agent_simple` (`enterprise_id`, `agent_name`, `persona`, `system_prompt`, `answer_style`, `temperature`)
-- VALUES (1, '客服助手', '专业客服', '你是一个专业的客服助手，请根据知识库内容回答用户问题。', 'detailed', 0.7);

-- 示例：创建一个高级智能体（风险巡检）
-- INSERT INTO `agent_advanced` (`enterprise_id`, `agent_name`, `description`, `enable_q_optimize`, `enable_safety`)
-- VALUES (1, '风险巡检助手', '自动扫描企业风险并生成报告', 1, 1);
