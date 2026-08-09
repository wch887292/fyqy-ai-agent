# AI智能体搭建功能技术文档

## 一、功能概述

AI智能体搭建（Agent Builder）是V3.0新增的核心功能，提供两种智能体类型：

### 1. 简易智能体（Simple Agent）
- **定位**：快速上线、基本问答场景
- **核心能力**：
  - 系统提示词（System Prompt）配置
  - 知识库文档关联（向量检索增强）
  - 回答风格选择（简洁/详细/友好/专业）
  - 温度参数调节（0~1）
  - 访问密码保护（可选）
- **适用场景**：客服问答、产品咨询、内部知识库查询

### 2. 高级智能体（Advanced Agent）
- **定位**：复杂业务逻辑、自定义工作流
- **核心能力**：
  - 敏感词过滤（安全拦截）
  - 问题优化（意图识别+语义补全）
  - 知识库检索增强
  - 执行记录追溯
  - 工作流节点配置（预留扩展）
- **适用场景**：流程审批、复杂咨询、多轮对话

---

## 二、技术架构

### 2.1 后端架构

```
backend/src/modules/agent-builder/
├── agent-builder.service.ts    # 业务逻辑层（12.7KB）
├── agent-builder.controller.ts # REST API控制器（3.2KB）
└── agent-builder.module.ts     # NestJS模块声明（675B）
```

### 2.2 数据库设计

**实体类**（`backend/src/entities/agent.entity.ts`）：

| 实体名 | 表名 | 说明 |
|--------|------|------|
| `AgentSimple` | `agent_simple` | 简易智能体配置 |
| `AgentAdvanced` | `agent_advanced` | 高级智能体配置 |
| `AgentAdvancedNode` | `agent_advanced_node` | 工作流节点 |
| `AgentExecRecord` | `agent_exec_record` | 问答执行记录 |

**DDL脚本**：`docs/agent-builder-ddl.sql`

### 2.3 核心依赖

- **TypeORM**：实体映射与数据库操作
- **AiService**：AI中间层服务（LLM调用、向量检索）
- **AuthGuard**：JWT鉴权与租户隔离

---

## 三、API接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/agent-builder/kb-docs` | 获取知识库文档列表 |
| GET | `/v1/agent-builder/simple/list` | 简易智能体分页列表 |
| POST | `/v1/agent-builder/simple/save` | 创建/更新简易智能体 |
| POST | `/v1/agent-builder/simple/enable` | 启用/禁用简易智能体 |
| DELETE | `/v1/agent-builder/simple/delete/:id` | 删除简易智能体 |
| POST | `/v1/agent-builder/simple/chat/:id` | 简易智能体对话 |
| GET | `/v1/agent-builder/advanced/list` | 高级智能体分页列表 |
| POST | `/v1/agent-builder/advanced/save` | 创建/更新高级智能体 |
| POST | `/v1/agent-builder/advanced/enable` | 启用/禁用高级智能体 |
| DELETE | `/v1/agent-builder/advanced/delete/:id` | 删除高级智能体 |
| GET | `/v1/agent-builder/advanced/nodes/:flowId` | 获取工作流节点 |
| POST | `/v1/agent-builder/advanced/chat/:id` | 高级智能体对话 |
| GET | `/v1/agent-builder/record/list` | 执行记录分页列表 |

---

## 四、核心逻辑实现

### 4.1 简易智能体对话流程

```
用户提问
  ↓
校验智能体状态（是否存在、是否启用、密码验证）
  ↓
解析关联知识库文档ID
  ↓
【有知识库】向量检索 → 提取相关片段 → 注入Prompt
【无知识库】直接使用System Prompt
  ↓
LLM生成回答
  ↓
保存执行记录（问题、回答、引用来源、耗时）
  ↓
返回结果
```

### 4.2 高级智能体对话流程

```
用户提问
  ↓
校验智能体状态
  ↓
【敏感词过滤】拦截违规问题
  ↓
【问题优化】意图识别+语义补全（可选）
  ↓
【知识库检索】向量搜索相关文档
  ↓
LLM生成回答（注入参考资料）
  ↓
保存执行记录
  ↓
返回结果
```

### 4.3 关键代码实现

**服务层**（`agent-builder.service.ts`）：
- `simpleChat()`：简易智能体对话入口
- `advancedChat()`：高级智能体对话入口（含敏感词过滤、问题优化）
- `kbDocList()`：获取知识库文档列表（供关联选择）

**控制器层**（`agent-builder.controller.ts`）：
- 统一使用 `@UseGuards(AuthGuard)` 鉴权
- 统一使用 `@GetCurrent() user: AuthUser` 获取当前用户
- 返回格式遵循 `R.ok()` 统一响应结构

---

## 五、前端实现

### 5.1 文件结构

```
frontend/src/
├── views/agent/
│   ├── builder.vue              # 主页面（Tabs布局）
│   ├── builder-simple.vue       # 简易智能体管理
│   ├── builder-advanced.vue     # 高级智能体管理
│   └── builder-records.vue      # 执行记录列表
└── api/index.ts
    └── agentBuilderApi          # API接口定义（14个接口）
```

### 5.2 路由配置

```typescript
// frontend/src/router/index.ts
{
  path: 'agent/builder',
  name: 'AgentBuilder',
  component: () => import('../views/agent/builder.vue'),
  meta: { code: 'agent:builder', title: 'AI智能体搭建' },
  children: [
    { path: '', redirect: 'simple' },
    { path: 'simple', component: () => import('../views/agent/builder-simple.vue'), meta: { code: 'agent:builder:simple', title: '简易智能体' } },
    { path: 'advanced', component: () => import('../views/agent/builder-advanced.vue'), meta: { code: 'agent:builder:advanced', title: '高级智能体' } },
    { path: 'records', component: () => import('../views/agent/builder-records.vue'), meta: { code: 'agent:builder:records', title: '执行记录' } },
  ],
}
```

---

## 六、配置启动

### 6.1 数据库初始化

```bash
# 执行DDL脚本（SQLite）
sqlite3 data/fae.db < docs/agent-builder-ddl.sql

# 或MySQL
mysql -u root -p fae_platform < docs/agent-builder-ddl.sql
```

### 6.2 后端启动

```bash
cd backend
npm install
npm run dev
```

验证接口：
```bash
curl http://localhost:8080/api/v1/agent-builder/simple/list
```

### 6.3 前端启动

```bash
cd frontend
npm install
npm run dev
```

访问地址：http://localhost:5173

### 6.4 菜单权限配置

在数据库 `sys_menu` 表中添加菜单项：

```sql
INSERT INTO sys_menu (parent_id, name, code, path, component, sort, icon) VALUES
(0, 'AI智能体搭建', 'agent:builder', '/agent/builder', 'AgentBuilder', 10, 'ChatDotRound');
```

---

## 七、数据字典

### 7.1 回答风格（answer_style）

| 值 | 说明 |
|----|------|
| `concise` | 简洁 |
| `detailed` | 详细 |
| `friendly` | 友好 |
| `professional` | 专业 |

### 7.2 智能体类型（agent_type）

| 值 | 说明 |
|----|------|
| `simple` | 简易智能体 |
| `advanced` | 高级智能体 |

### 7.3 工作流节点类型（node_type）

| 值 | 说明 |
|----|------|
| `input` | 输入节点 |
| `filter` | 判断器节点 |
| `llm` | LLM节点 |
| `kb_search` | 知识库检索节点 |
| `function_call` | 函数调用节点 |
| `output` | 输出节点 |

---

## 八、安全设计

### 8.1 租户隔离

所有查询自动添加 `enterprise_id` 过滤，确保企业数据隔离。

### 8.2 访问密码

简易智能体支持配置访问密码，调用对话接口时需传入：

```json
{
  "question": "用户问题",
  "password": "访问密码"
}
```

### 8.3 敏感词过滤

高级智能体支持配置敏感词列表，自动拦截违规问题：

```json
{
  "enable_safety": 1,
  "sensitive_words": "敏感词1,敏感词2,敏感词3"
}
```

---

## 九、扩展建议

### 9.1 工作流引擎

当前高级智能体的工作流节点为预留结构，建议后续接入：
- [Node.js Workflow Engine](https://github.com/nestjsx/cron)
- 或自研基于DAG的有向无环图执行引擎

### 9.2 多模态支持

可扩展支持：
- 图片理解（Vision）
- 语音交互（ASR/TTS）
- 文件生成（PDF/Word）

### 9.3 技能市场

借鉴 OpenClaw 生态，搭建智能体技能市场：
- 官方技能仓库
- 用户自定义技能上传
- 技能版本管理

---

## 十、测试验证

### 10.1 冒烟测试

```bash
# 后端测试
curl -X POST http://localhost:8080/api/v1/agent-builder/simple/save \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "agent_name": "测试智能体",
    "system_prompt": "你是一个友好的客服助手",
    "answer_style": "detailed"
  }'

# 对话测试
curl -X POST http://localhost:8080/api/v1/agent-builder/simple/chat/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"question": "你好"}'
```

### 10.2 前端测试

1. 登录系统（admin/123456）
2. 导航到「AI智能体搭建」菜单
3. 创建简易智能体
4. 进行对话测试
5. 查看执行记录

---

## 十一、已知限制

1. **文件锁定问题**：WorkBuddy safe-delete 机制会锁定已存在文件，需手动解锁后才能写入
2. **工作流引擎**：当前为MVP实现，完整工作流引擎待后续开发
3. **并发控制**：未实现智能体对话的并发限流

---

## 十二、版本信息

- **版本**：V3.0
- **发布日期**：2026-08-09
- **研发主体**：晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
- **负责人**：吴赐虹

---

## 附录：文件清单

### 后端文件
```
backend/src/modules/agent-builder/
├── agent-builder.service.ts    (12,751 bytes)
├── agent-builder.controller.ts (3,074 bytes)
└── agent-builder.module.ts     (675 bytes)

backend/src/entities/agent.entity.ts  (实体定义，约2KB)
backend/src/app.module.ts             (模块注册)
```

### 前端文件
```
frontend/src/views/agent/
├── builder.vue             (688 bytes)
├── builder-simple.vue      (9,193 bytes)
├── builder-advanced.vue    (8,503 bytes)
└── builder-records.vue     (4,315 bytes)

frontend/src/api/index.ts           (API定义，约12KB)
frontend/src/router/index.ts        (路由配置，约8.5KB)
```

### 文档文件
```
docs/
├── agent-builder-ddl.sql      (数据库DDL脚本，约6KB)
└── agent-builder-technical-doc.md  (本文档，约10KB)
```
