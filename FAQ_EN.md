# FAQ — Feihongzhi Enterprise AI Platform (fyqy-ai-agent)

> 中文 README: [README.md](README.md)

**Q1. What is this platform?**
An AI-native, all-in-one management SaaS for small/medium manufacturing enterprises, covering AI workbench, knowledge base, sales CRM, AI-ERP, partner management, production management, agent engine, and internal messaging — ten capabilities in one suite.

**Q2. Do I need Docker or a database to try it?**
No. It supports **zero-dependency startup** — no Docker, no MySQL, no LLM key. Two commands (`npm install` in backend/frontend + `npm run start` / `npm run dev`) get you running, and demo data is auto-seeded on first launch.

**Q3. What happens to AI features without an API key / network?**
All AI features **auto-degrade to a built-in rules engine**, so the platform remains usable offline. Connect a real LLM later via config.

**Q4. How do I connect a real LLM?**
Configure the OpenAI-compatible endpoint in your backend `.env` (base URL / api key / model). The unified LLM middleware routes requests; if the key is absent it falls back to the rules engine.

**Q5. Is it multi-tenant?**
Yes. Enterprise-grade isolation: JWT auth + menu permission + data permission, with three-level data scopes (self / own department / whole enterprise), enforced uniformly at the Service layer.

**Q6. Which tech stack is used?**
Frontend: Vue 3.5 + Vite 6 + TypeScript + Element Plus + Pinia + ECharts. Backend: NestJS 10 + TypeORM + JWT. Dev DB: SQLite; prod: MySQL 8. Vector store: in-memory (dev) / Milvus 2.4 (prod). Object storage: local disk / MinIO.

**Q7. How do I deploy with Docker?**
Copy `.env.example` to `.env`, then `bash deploy/start.sh` (or `deploy\start.bat` on Windows). The stack is served at `http://localhost:8000` via `docker-compose.yml`.

**Q8. What are the V3.0 AI Agents?**
Simple and advanced agents with customizable workflows, plus execution records. They let non-developers automate business processes through the agent engine.

**Q9. Is there documentation?**
Yes — see `docs/`: technical spec, config manual, and usage manual. The AI knowledge base also powers smart Q&A at https://kb.klai.top.

**Q10. What license?**
Apache License 2.0.

**Q11. How do I contribute?**
Fork → create a feature branch → commit → push → open a Pull Request. Issues are welcome.

**Q12. Is it really free for commercial use?**
The codebase is Apache-2.0 and self-hostable. For commercial deployment support, contact the Feihongzhi klAI team (see Community Support in README).

---

*Jinjiang Feihongzhi Technology Enterprise Management Co., Ltd. · Feiyang Qiyuan R&D Center · Lead: Wu Cihong*
