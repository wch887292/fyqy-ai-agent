# 飞虹智 · 企业AI一站式平台 V1.0

> 面向中小制造企业的 AI 原生一体化管理平台
> 研发主体：**晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心**
> 项目负责人：**吴赐虹**

一套开箱即用的企业级 SaaS 平台，覆盖 **AI 工作台、组织管理、AI 知识库、AI 销售 CRM、AI-ERP 进销存、合伙人管理、系统设置** 七大模块，内置多租户隔离、三级数据权限与 AI 能力中间层。

---

## 一、快速开始

### 方式一：本地开发模式（零外部依赖，推荐首次体验）

无需 Docker、无需 MySQL、无需大模型密钥，两条命令即可跑通全部功能。

```bash
# 后端：SQLite + 内存向量 + 本地磁盘
cd backend
cp .env.example .env
npm install
npm run start          # http://localhost:8080

# 前端（另开一个终端）
cd frontend
npm install
npm run dev            # http://localhost:5173
```

首次启动会自动写入「晋江华祥鞋材科技有限公司」整套演示数据（4 个部门、6 名员工、6 个客户、5 个产品、2 张订单、3 篇知识库文档），无需手工造数。

### 方式二：生产部署（Docker Compose）

```bash
cp .env.example .env       # 修改 JWT_SECRET 与各项密码
bash deploy/start.sh       # Windows 双击 deploy\start.bat
```

访问 `http://<服务器IP>:8000` 即可。脚本会自动完成镜像构建、服务编排、健康检查与就绪等待。

停止服务：`bash deploy/stop.sh`，清空数据：`bash deploy/stop.sh --purge`。

---

## 二、演示账号

| 账号 | 密码 | 角色 | 数据权限 |
|---|---|---|---|
| `admin` | `123456` | 企业管理员 | 全企业数据，全部菜单 |
| `sales01` | `123456` | 销售主管 | 本部门数据 |
| `sales02` | `123456` | 销售专员 | 仅本人数据 |
| `partner01` | `123456` | 区域合伙人 | 合伙人中心 |
| `stock01` | `123456` | 仓储主管 | 进销存模块 |
| `superadmin` | `admin@2026` | 平台超级管理员 | 跨企业运营 |

登录后左侧菜单由后端按角色权限实时裁剪下发，不同账号看到的功能不同，可直接对比验证权限体系。

---

## 三、技术架构

### 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3.5 + Vite 6 + TypeScript + Element Plus 2.9 + Pinia + Vue Router 4 + ECharts 5 |
| 后端 | NestJS 10 + TypeORM 0.3 + JWT + bcrypt |
| 数据库 | SQLite（dev） / MySQL 8（prod） |
| 向量库 | 内存向量（dev） / Milvus 2.4（prod） |
| 对象存储 | 本地磁盘（dev） / MinIO（prod） |
| 大模型 | OpenClaw（兼容 OpenAI Chat Completions 协议），未配置时自动降级为内置规则引擎 |

### 双环境设计

平台的核心工程特性是 **同一份代码、两套运行形态**，由 `APP_MODE` 与三个驱动开关控制，无需改动任何业务代码：

| 能力 | dev 模式 | prod 模式 |
|---|---|---|
| `DB_DRIVER` | `sqlite` | `mysql` |
| `VECTOR_DRIVER` | `memory` | `milvus` |
| `STORAGE_DRIVER` | `local` | `minio` |

### AI 能力中间层与自动降级

所有 AI 调用统一收敛到 `LlmService`，业务代码只面向契约编程：

```ts
llm.complete({ scene, enterpriseId, prompt, payload })
llm.completeJson({ scene, enterpriseId, prompt, payload })
```

当 `LLM_API_ENDPOINT` 为空或远端调用失败时，自动降级到内置 **MockEngine** 规则引擎，覆盖经营简报、客户意向评分、知识库问答、销售日报等全部场景。**这意味着断网、无密钥环境下所有 AI 功能依然可完整演示**，返回结果中会带上 `fallback_reason` 标明降级原因，前端界面会显示对应状态标签。

### 多租户与数据权限

- **租户隔离**：JWT 载荷中的 `enterprise_id` 为唯一可信来源，通过 `@TenantId()` 装饰器注入，所有查询强制携带企业维度，网关层拦截一切跨租户访问，前端传参无法越权。
- **三级数据权限**：`data_scope` = 1 本人 / 2 本部门 / 3 全企业，在 Service 层统一由 `applyScope()` 与 `canOperate()` 收口，列表查询与单条操作双向校验。
- **菜单权限**：后端按角色裁剪后随 `profile.menus` 下发，前端路由守卫二次校验，未授权页面跳 403。

---

## 四、功能模块

| 模块 | 页面 | 核心能力 |
|---|---|---|
| AI 工作台 | 首页、AI 助手 | 经营概览、四类待办、近 7 日趋势图、AI 经营简报、全局对话助手 |
| 组织管理 | 部门、员工、角色、合伙人 | 部门树、员工管理、角色权限矩阵、数据范围配置 |
| AI 知识库 | 文档管理、上传、智能问答 | 文档向量化、语义检索、带引用来源的 AI 问答 |
| AI 销售 CRM | 客户、公海、跟进、日报、统计 | AI 意向评分分级、公海流转、跟进提醒、AI 一键生成日报 |
| AI-ERP | 产品、库存、订单、经营日报 | 出入库、库存预警、订单状态流转、AI 经营日报 |
| 合伙人管理 | 分润配置、业绩、风险 | 分润规则、业绩核算、AI 风险扫描 |
| 系统设置 | 企业信息、AI 配置、操作日志 | 企业资料、大模型连通性测试、全量操作留痕 |

---

## 五、工程结构

```
fae-platform/
├── backend/                    NestJS 后端（55 个 TS 文件，约 8500 行）
│   ├── src/
│   │   ├── common/             鉴权装饰器、数据权限、统一响应
│   │   ├── config/             配置中心，双环境开关
│   │   ├── entities/           7 组实体定义
│   │   ├── infra/              LLM / 向量库 / 存储三大基础设施抽象
│   │   └── modules/            auth org kb crm erp partner system workbench ai seed
│   ├── Dockerfile
│   └── .env.example
├── frontend/                   Vue3 前端（30 个组件，约 11000 行）
│   ├── src/
│   │   ├── api/                97 个接口封装，统一解包与 401 跳转
│   │   ├── components/         全局 AI 助手抽屉
│   │   ├── layout/             主布局，菜单由后端权限驱动
│   │   ├── router/             路由与权限守卫
│   │   ├── store/              Pinia 用户状态
│   │   └── views/              7 大模块共 25 个业务页面
│   ├── Dockerfile
│   └── nginx.conf
├── deploy/
│   ├── init.sql                MySQL 建表与基础字典
│   ├── start.sh / start.bat    一键部署
│   └── stop.sh                 停止与清理
├── docker-compose.yml          MySQL + MinIO + etcd + Milvus + 前后端
└── .env.example
```

---

## 六、接口约定

- 统一前缀 `/api`，统一响应体 `{ code, msg, data }`，`code = 0` 表示成功。
- 认证方式 `Authorization: Bearer <token>`，令牌默认有效期 12 小时。
- 请求入参使用 `snake_case`，响应字段使用 `camelCase`（`enterprise/info` 为历史兼容例外）。
- 客户列表固定每页 10 条（产品硬规则，由 `CRM_PAGE_SIZE` 控制）。
- 客户 `contact_time` 一律取服务端实时时间，忽略前端传值。

当前后端共 **97 个路由**，前端 **95 个接口调用全部命中**，无孤儿接口。

---

## 七、配置说明

关键环境变量（完整清单见 `.env.example`）：

| 变量 | 说明 |
|---|---|
| `APP_MODE` | `dev` 轻量模式 / `prod` 生产模式 |
| `JWT_SECRET` | 令牌签名密钥，**上线必须修改** |
| `DB_DRIVER` | `sqlite` / `mysql` |
| `DB_SYNCHRONIZE` | dev 建议 `true` 自动建表；prod 用 `init.sql` 建表后置 `false` |
| `VECTOR_DRIVER` | `memory` / `milvus` |
| `STORAGE_DRIVER` | `local` / `minio` |
| `LLM_API_ENDPOINT` | OpenClaw 地址，留空则走内置规则引擎 |
| `SEED_DEMO` | 空库时是否写入演示数据，正式交付置 `false` |
| `CRM_PAGE_SIZE` | 客户列表每页条数，默认 10 |
| `CRM_FOLLOW_OVERDUE_DAYS` | 逾期未跟进预警阈值，默认 7 天 |

---

## 八、上线检查清单

- [ ] 修改 `JWT_SECRET` 为随机强密钥
- [ ] 修改 `DB_PASSWORD`、`MINIO_SECRET_KEY` 默认密码
- [ ] `SEED_DEMO` 置为 `false`，避免演示数据进入生产库
- [ ] `DB_SYNCHRONIZE` 置为 `false`，改由 `init.sql` 管理表结构
- [ ] 配置 `LLM_API_ENDPOINT` 与 `LLM_API_KEY` 接入真实 OpenClaw
- [ ] 关闭 MySQL / MinIO / Milvus 的对外端口映射，仅保留前端入口
- [ ] 前端入口配置 HTTPS 证书
- [ ] 配置数据卷定期备份

---

## 九、常见问题

**Q：没有大模型密钥能用吗？**
能。所有 AI 功能会自动降级到内置规则引擎，输出结构与真实模型完全一致，仅文案为模板生成，返回中带 `fallback_reason` 标识。

**Q：Milvus 启动很慢？**
首次启动需初始化元数据，约 1-2 分钟属正常现象。`deploy/start.sh` 已内置健康检查等待逻辑。

**Q：如何新增一个企业租户？**
用 `superadmin` 登录，在系统设置中创建企业，系统会自动生成该企业的管理员账号与初始密码。

**Q：dev 模式的数据存在哪？**
`backend/data/fae_enterprise.db`（SQLite）与 `backend/data/uploads/`（附件）。删除 `data` 目录即可重置为初始演示数据。

---

© 2026 晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
