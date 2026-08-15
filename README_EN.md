# Feihongzhi · Enterprise AI All-in-One Platform

> 🏭 An AI-native, all-in-one management platform for small and medium manufacturing enterprises
>
> An out-of-the-box enterprise SaaS covering **AI workbench, org management, AI knowledge base, AI sales CRM, AI-ERP (inventory), partner management, production management, agent engine, and internal messaging** — ten capabilities in one suite.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-%233178C6.svg)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-%2342d392.svg)](https://vuejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-%23E02D4E.svg)](https://nestjs.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> 中文: [README.md](README.md)

## ⭐ Why this project

- ✅ **Zero-dependency startup**: no Docker, no MySQL, no LLM key required — runs with two commands
- ✅ **AI auto-degradation**: with no network/key, all AI features gracefully fall back to the built-in rules engine
- ✅ **Out-of-the-box**: first launch auto-seeds demo data with complete business flows
- ✅ **Multi-tenant isolation**: enterprise-grade data permissions, JWT auth, strict tenant isolation
- ✅ **V3.0 new AI Agents**: simple and advanced agents with customizable workflows

## 🚀 Quick Start

### Option A: Local development (recommended)

```bash
# backend
cd backend
npm install
npm run start          # http://localhost:8080

# frontend (another terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### Option B: Docker deployment

```bash
# copy config
cp .env.example .env

# start all services
bash deploy/start.sh
# or Windows: deploy\start.bat

# visit http://localhost:8000
```

## 📦 Core Features

| Module | Description |
|---|---|
| 🤖 **AI Agents** | Simple agents, advanced agents, execution records (V3.0) |
| 🏠 **AI Workbench** | Business overview, todos, trend charts, AI chat |
| 📚 **AI Knowledge Base** | Document management, vector search, smart Q&A, versioning |
| 👥 **Sales CRM** | Customer management, public-pool routing, intent scoring, follow-up reminders |
| 📊 **AI-ERP** | Product management, stock alerts, order flow, daily operations report |
| 👔 **Partner Management** | Profit-sharing config, performance accounting, risk scan, settlement ledger |
| 🏭 **Production Management** | Production work orders, scheduling, inbound closed loop |
| 🔧 **Agent Engine** | OpenClaw agent tasks, scheduled triggers, execution logs |
| 💬 **Internal Messaging** | Unified message center, unread badges |
| 📁 **Batch Import/Export** | Excel batch ops, bulk document upload |

## 🛠 Tech Architecture

### Stack

| Layer | Choice |
|---|---|
| Frontend | Vue 3.5 + Vite 6 + TypeScript + Element Plus + Pinia + ECharts |
| Backend | NestJS 10 + TypeORM 0.3 + JWT + bcrypt |
| Database | SQLite (dev) / MySQL 8 (prod) |
| Vector store | In-memory (dev) / Milvus 2.4 (prod) |
| Object storage | Local disk (dev) / MinIO (prod) |
| LLM | OpenAI Chat Completions compatible |

### Core characteristics
- **Dual-environment design**: one codebase, switch dev/prod via env vars
- **AI capability middleware**: unified LLM interface with auto-degradation to built-in rules engine
- **Multi-tenant isolation**: enterprise data isolation, JWT auth + menu permission + data permission
- **Three-level data permission**: self / own department / whole enterprise, uniformly enforced at the Service layer

## 📂 Project Structure

```
fyqy-ai-agent/
├── backend/          # NestJS backend (~8299 LOC)
│   ├── src/
│   │   ├── modules/  # 17 business modules
│   │   ├── entities/ # 12 data entity groups
│   │   ├── common/   # auth, permission, response wrapper
│   │   └── infra/    # LLM, vector store, storage services
│   └── scripts/      # automated test scripts
├── frontend/         # Vue 3 frontend (~37 pages)
│   ├── src/
│   │   ├── views/    # business pages
│   │   ├── components/ # global components
│   │   ├── api/      # API wrappers
│   │   └── router/   # route config
│   └── Dockerfile
├── docs/             # technical docs
│   ├── agent-builder-technical-spec.md
│   ├── ai-agent-config-manual.md
│   └── ai-agent-usage-manual.md
├── deploy/           # deployment scripts
└── docker-compose.yml
```

## 📖 Docs

- 📘 [Technical Spec](docs/agent-builder-technical-spec.md) — architecture, API, core logic
- 📗 [Config Manual](docs/ai-agent-config-manual.md) — env config, DB deployment, menu permission
- 📙 [Usage Manual](docs/ai-agent-usage-manual.md) — operations, best practices, FAQ

## 🏷 Topics

`ai` `enterprise` `saas` `nestjs` `vue3` `knowledge-base` `crm` `erp` `agent` `llm` `multi-tenant` `typescript` `SME` `smart-manufacturing`

## 🌐 Official Site & Related Projects

Maintained by **Jinjiang Feihongzhi Technology Enterprise Management Co., Ltd. · Feiyang Qiyuan R&D Center**, part of the Feihongzhi klAI open-source ecosystem.

- 🏠 **Official site**: [https://klai.top](https://klai.top) — Feihongzhi klAI · Quanzhou manufacturing-AI service provider
- 📦 **Open-source matrix**: [https://klai.top/opensource.html](https://klai.top/opensource.html) — all open-source projects
- 📚 **AI Knowledge Base**: [https://kb.klai.top](https://kb.klai.top) — product docs & smart Q&A (MaxKB-powered)

**Related projects**:

| Project | Description |
|------|------|
| [GEO-SaaS](https://github.com/wch887292/geo-saa) | AI-driven GEO search-optimization platform |
| [Feihongzhi Enterprise AI Platform](https://github.com/wch887292/fyqy-ai-agent) | SME AI-native all-in-one platform (this repo) |
| [FyqyClaw](https://github.com/wch887292/FyqyClaw) | Full-process AI dev tool (IDE + AI Agent) |
| [StarSleep AI](https://github.com/wch887292/xmai) | Sleep-health WeChat mini-program + private Node backend |

> ⭐ If this project helps you, please **Star** and share to help more people discover the Feihongzhi open-source ecosystem!

## 📄 License

Apache License 2.0 — see the [LICENSE](LICENSE) file

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📊 Repo Stats

[![GitHub stars](https://img.shields.io/github/stars/wch887292/fyqy-ai-agent?style=social)](https://github.com/wch887292/fyqy-ai-agent/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/wch887292/fyqy-ai-agent?style=social)](https://github.com/wch887292/fyqy-ai-agent/network/members)
[![GitHub issues](https://img.shields.io/github/issues/wch887292/fyqy-ai-agent)](https://github.com/wch887292/fyqy-ai-agent/issues)
[![GitHub license](https://img.shields.io/github/license/wch887292/fyqy-ai-agent)](https://github.com/wch887292/fyqy-ai-agent/blob/master/LICENSE)

---

> 💡 **Tip**: This project is out-of-the-box; no extra config needed to experience full features. If you hit issues, open an Issue.

*Jinjiang Feihongzhi Technology Enterprise Management Co., Ltd. · Feiyang Qiyuan R&D Center · Lead: Wu Cihong*
