# 飞虹智 · 企业AI一站式平台

> 🏭 面向中小制造企业的 AI 原生一体化管理平台
>
> 一套开箱即用的企业级 SaaS 平台，覆盖 **AI 工作台、组织管理、AI 知识库、AI 销售 CRM、AI-ERP 进销存、合伙人管理、生产管理、智能体引擎、站内消息** 十大能力

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-%233178C6.svg)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-%2342d392.svg)](https://vuejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-%23E02D4E.svg)](https://nestjs.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## ⭐ 为什么选择本项目

- ✅ **零依赖启动**：无需 Docker、无需 MySQL、无需大模型密钥，两条命令即可运行
- ✅ **AI 自动降级**：断网/无密钥环境下，所有 AI 功能自动降级到内置规则引擎
- ✅ **开箱即用**：首次启动自动写入演示数据，包含完整业务流程
- ✅ **多租户隔离**：企业级数据权限，JWT 鉴权，租户数据严格隔离
- ✅ **V3.0 新增 AI 智能体**：支持简易智能体和高级智能体，可自定义工作流

## 🚀 快速开始

### 方式一：本地开发模式（推荐）

```bash
# 后端
cd backend
npm install
npm run start          # http://localhost:8080

# 前端（另开终端）
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### 方式二：Docker 部署

```bash
# 复制配置
cp .env.example .env

# 启动所有服务
bash deploy/start.sh
# 或 Windows: deploy\start.bat

# 访问 http://localhost:8000
```

## 📦 核心功能

| 模块 | 说明 |
|---|---|
| 🤖 **AI 智能体** | 简易智能体、高级智能体、执行记录（V3.0） |
| 🏠 **AI 工作台** | 经营概览、待办事项、趋势图表、AI 对话 |
| 📚 **AI 知识库** | 文档管理、向量检索、智能问答、版本管理 |
| 👥 **销售 CRM** | 客户管理、公海流转、意向评分、跟进提醒 |
| 📊 **AI-ERP** | 产品管理、库存预警、订单流转、经营日报 |
| 👔 **合伙人管理** | 分润配置、业绩核算、风险扫描、结算流水 |
| 🏭 **生产管理** | 生产工单、排产管理、入库闭环 |
| 🔧 **智能体引擎** | OpenClaw 智能体任务、定时触发、执行日志 |
| 💬 **站内消息** | 统一消息中心、未读角标 |
| 📁 **批量导入导出** | Excel 批量操作、文档批量上传 |

## 🛠 技术架构

### 技术栈

| 层 | 技术选型 |
|---|---|
| 前端 | Vue 3.5 + Vite 6 + TypeScript + Element Plus + Pinia + ECharts |
| 后端 | NestJS 10 + TypeORM 0.3 + JWT + bcrypt |
| 数据库 | SQLite (开发) / MySQL 8 (生产) |
| 向量库 | 内存向量 (开发) / Milvus 2.4 (生产) |
| 对象存储 | 本地磁盘 (开发) / MinIO (生产) |
| 大模型 | 兼容 OpenAI Chat Completions 协议 |

### 核心特性

- **双环境设计**：同一份代码，通过环境变量切换 dev/prod 模式
- **AI 能力中间层**：统一 LLM 接口，支持自动降级到内置规则引擎
- **多租户隔离**：企业级数据隔离，JWT 鉴权 + 菜单权限 + 数据权限
- **三级数据权限**：本人 / 本部门 / 全企业，Service 层统一收口

## 📂 项目结构

```
fyqy-ai-agent/
├── backend/          # NestJS 后端 (~8299 行代码)
│   ├── src/
│   │   ├── modules/  # 17 个业务模块
│   │   ├── entities/ # 12 组数据实体
│   │   ├── common/   # 鉴权、权限、响应封装
│   │   └── infra/    # LLM、向量库、存储服务
│   └── scripts/      # 自动化测试脚本
├── frontend/         # Vue 3 前端 (~37 个页面)
│   ├── src/
│   │   ├── views/    # 业务页面
│   │   ├── components/ # 全局组件
│   │   ├── api/      # 接口封装
│   │   └── router/   # 路由配置
│   └── Dockerfile
├── docs/             # 技术文档
│   ├── agent-builder-technical-spec.md
│   ├── ai-agent-config-manual.md
│   └── ai-agent-usage-manual.md
├── deploy/           # 部署脚本
└── docker-compose.yml
```

## 📖 文档

- 📘 [技术说明书](docs/agent-builder-technical-spec.md) - 架构设计、API 接口、核心逻辑
- 📗 [配置说明书](docs/ai-agent-config-manual.md) - 环境配置、数据库部署、菜单权限
- 📙 [使用说明书](docs/ai-agent-usage-manual.md) - 功能操作、最佳实践、常见问题

## 🏷 话题标签

`ai` `enterprise` `saas` `nestjs` `vue3` `knowledge-base` `crm` `erp` `agent` `llm` `multi-tenant` `typescript` `中小型企业` `智能制造`

## 🌐 官方站点与关联开源项目

本仓库由 **晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心** 维护，是飞虹智 klAI 开源生态的一部分。

- 🏠 **官方网站**：[https://klai.top](https://klai.top) — 飞虹智 klAI · 泉州制造业 AI 服务商
- 📦 **开源矩阵**：[https://klai.top/opensource.html](https://klai.top/opensource.html) — 全部开源项目一览
- 📚 **AI 知识库**：[https://kb.klai.top](https://kb.klai.top) — 产品文档与智能问答（MaxKB 驱动）

**关联项目**：

| 项目 | 简介 |
|------|------|
| [GEO-SaaS](https://github.com/wch887292/geo-saa) | AI 驱动的全域 GEO 搜索优化平台 |
| [飞虹智·企业AI平台](https://github.com/wch887292/fyqy-ai-agent) | 中小制造企业 AI 原生一体化管理平台（本仓库） |
| [FyqyClaw](https://github.com/wch887292/FyqyClaw) | 全流程 AI 驱动开发工具（IDE + AI Agent） |
| [星眠AI](https://github.com/wch887292/xmai) | 睡眠健康管理微信小程序 + 私有部署后端 |

> ⭐ 如果这个项目对你有帮助，欢迎 **Star** 并分享，让更多人发现飞虹智开源生态！


## 📄 许可证

Apache License 2.0 - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📊 仓库统计

[![GitHub stars](https://img.shields.io/github/stars/wch887292/fyqy-ai-agent?style=social)](https://github.com/wch887292/fyqy-ai-agent/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/wch887292/fyqy-ai-agent?style=social)](https://github.com/wch887292/fyqy-ai-agent/network/members)
[![GitHub issues](https://img.shields.io/github/issues/wch887292/fyqy-ai-agent)](https://github.com/wch887292/fyqy-ai-agent/issues)
[![GitHub license](https://img.shields.io/github/license/wch887292/fyqy-ai-agent)](https://github.com/wch887292/fyqy-ai-agent/blob/master/LICENSE)

---

> 💡 **提示**：本项目支持开箱即用，无需额外配置即可体验完整功能。如遇问题，欢迎提交 Issue。
