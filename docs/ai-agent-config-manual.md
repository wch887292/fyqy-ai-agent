# AI智能体搭建功能配置说明书

## 一、环境准备

### 1.1 系统要求
- **操作系统**：Windows 10+ / Ubuntu 18.04+ / macOS 10.15+
- **Node.js**：v22 LTS（推荐）
- **npm**：v10+
- **数据库**：MySQL 5.7+（生产）/ SQLite（开发）
- **内存**：建议8GB以上
- **磁盘**：建议20GB以上可用空间

### 1.2 目录结构
```
fae-platform/
├── backend/              # 后端服务
│   ├── src/
│   │   ├── modules/
│   │   │   └── agent-builder/    # 智能体搭建模块
│   │   │       ├── agent-builder.service.ts
│   │   │       ├── agent-builder.controller.ts
│   │   │       └── agent-builder.module.ts
│   │   ├── entities/
│   │   │   └── agent.entity.ts   # 实体定义
│   │   └── app.module.ts         # 主模块（已注册AgentBuilderModule）
│   └── package.json
│
├── frontend/             # 前端应用
│   ├── src/
│   │   ├── views/agent/        # 智能体搭建视图
│   │   │   ├── builder.vue
│   │   │   ├── builder-simple.vue
│   │   │   ├── builder-advanced.vue
│   │   │   └── builder-records.vue
│   │   ├── api/index.ts        # API定义（agentBuilderApi）
│   │   └── router/index.ts     # 路由配置
│   └── package.json
│
└── docs/                 # 文档
    ├── agent-builder-ddl.sql     # 数据库DDL
    ├── agent-builder-technical-spec.md  # 技术说明书
    ├── ai-agent-config-manual.md  # 本文档
    └── ai-agent-usage-manual.md   # 使用说明书
```

---

## 二、数据库配置

### 2.1 DDL执行

#### MySQL（生产环境）
```bash
# 连接数据库
mysql -u root -p fae_platform

# 执行DDL脚本
source /path/to/docs/agent-builder-ddl.sql;

# 验证表创建
SHOW TABLES LIKE 'agent_%';
```

#### SQLite（开发环境）
```bash
# 进入项目目录
cd H:/AI企业一站式应用/fae-platform

# 执行DDL
sqlite3 data/fae.db < docs/agent-builder-ddl.sql
```

### 2.2 数据库表结构

**agent_simple（简易智能体表）**
| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGINT UNSIGNED | 主键，自增 |
| enterprise_id | BIGINT UNSIGNED | 企业ID（租户隔离） |
| agent_type | VARCHAR(32) | 固定值：simple |
| agent_name | VARCHAR(128) | 智能体名称 |
| avatar | VARCHAR(256) | 智能体头像URL |
| persona | TEXT | 角色设定/人设描述 |
| system_prompt | TEXT | 系统提示词 |
| kb_doc_ids | TEXT | 关联知识库文档ID（逗号分隔） |
| answer_style | VARCHAR(32) | 回答风格：concise/detailed/friendly/professional |
| temperature | FLOAT | 温度参数（0~1，默认0.7） |
| max_tokens | INT | 最大Token数（默认2048） |
| show_refs | TINYINT | 是否显示引用：0否1是 |
| access_pwd | VARCHAR(64) | 访问密码（空则公开） |
| enable | TINYINT | 是否启用：0禁用1启用 |
| created_by | BIGINT | 创建人ID |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**agent_advanced（高级智能体表）**
| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGINT UNSIGNED | 主键，自增 |
| enterprise_id | BIGINT UNSIGNED | 企业ID |
| agent_type | VARCHAR(32) | 固定值：advanced |
| agent_name | VARCHAR(128) | 智能体名称 |
| avatar | VARCHAR(256) | 智能体头像URL |
| description | TEXT | 工作流描述 |
| input_questions | TEXT | 入口问题预设（每行一个） |
| enable_q_optimize | TINYINT | 是否开启问题优化：0否1是 |
| enable_safety | TINYINT | 是否开启敏感词过滤：0否1是 |
| sensitive_words | TEXT | 敏感词列表（逗号分隔） |
| kb_doc_ids | TEXT | 关联知识库文档ID（逗号分隔） |
| enable | TINYINT | 是否启用：0禁用1启用 |
| created_by | BIGINT | 创建人ID |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**agent_advanced_node（工作流节点表）**
| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGINT UNSIGNED | 主键，自增 |
| flow_id | BIGINT UNSIGNED | 关联的智能体ID |
| node_type | VARCHAR(32) | 节点类型：input/filter/llm/kb_search/function_call/output |
| node_name | VARCHAR(128) | 节点名称 |
| node_config | TEXT | 节点配置（JSON格式） |
| sort_order | INT | 排序权重 |
| created_by | BIGINT | 创建人ID |
| created_at | DATETIME | 创建时间 |

**agent_exec_record（执行记录表）**
| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGINT UNSIGNED | 主键，自增 |
| enterprise_id | BIGINT UNSIGNED | 企业ID |
| agent_id | BIGINT UNSIGNED | 智能体ID |
| agent_type | VARCHAR(32) | 智能体类型：simple/advanced |
| question | TEXT | 用户问题 |
| answer | LONGTEXT | AI回答 |
| refs | TEXT | 引用来源（JSON数组） |
| cost_ms | INT | 耗时（毫秒） |
| exec_status | VARCHAR(32) | 执行状态：success/fail |
| error_msg | TEXT | 错误信息 |
| created_by | BIGINT | 创建人ID |
| created_at | DATETIME | 创建时间 |

### 2.3 索引说明
- `idx_ent_simple_type`：企业ID + 智能体类型（复合索引）
- `idx_ent_simple_name`：企业ID + 智能体名称（复合索引）
- `idx_ent_adv_type`：企业ID + 智能体类型（复合索引）
- `idx_ent_adv_name`：企业ID + 智能体名称（复合索引）
- `idx_adv_node_flow`：工作流ID索引
- `idx_exec_agent`：智能体ID索引
- `idx_exec_ent_time`：企业ID + 创建时间（复合索引）

---

## 三、后端配置

### 3.1 环境配置
```bash
# 进入后端目录
cd backend

# 安装依赖
npm install

# 配置数据库连接（.env文件）
DB_DRIVER=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=fae_platform
DB_USERNAME=root
DB_PASSWORD=your_password
```

### 3.2 模块注册确认
`app.module.ts` 中已包含：
```typescript
import { AgentBuilderModule } from "./modules/agent-builder/agent-builder.module";
// ...
imports: [
  // ...
  AgentBuilderModule,  // 已注册
]
```

### 3.3 编译与启动
```bash
# 编译后端
npx nest build

# 开发模式（自动重启）
npm run dev

# 生产模式
npm run build
npm run start:prod
```

### 3.4 接口验证
```bash
# 测试接口连通性（需要登录token）
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/v1/agent-builder/simple/list
```

预期响应：
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "size": 10,
    "pages": 0
  }
}
```

---

## 四、前端配置

### 4.1 环境配置
```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 配置代理（.env.development）
VITE_API_BASE=http://localhost:8080/api/v1
```

### 4.2 编译与启动
```bash
# 开发模式
npm run dev

# 生产构建
npm run build
```

### 4.3 访问地址
- **前端**：http://localhost:5173
- **后端API**：http://localhost:8080/api/v1
- **文档接口**：http://localhost:8080/api/v1/agent-builder/

---

## 五、菜单权限配置

### 5.1 数据库配置
在 `sys_menu` 表中添加菜单项：

```sql
-- 添加一级菜单（AI智能体搭建）
INSERT INTO sys_menu (parent_id, name, code, path, component, sort, icon, create_time) 
VALUES (0, 'AI智能体搭建', 'agent:builder', '/agent/builder', 'AgentBuilder', 10, 'ChatDotRound', NOW());

-- 获取刚插入的ID
SET @menu_id = LAST_INSERT_ID();

-- 添加子菜单
INSERT INTO sys_menu (parent_id, name, code, path, component, sort, icon, create_time) 
VALUES 
(@menu_id, '简易智能体', 'agent:builder:simple', '/agent/builder/simple', 'AgentBuilderSimple', 1, NULL, NOW()),
(@menu_id, '高级智能体', 'agent:builder:advanced', '/agent/builder/advanced', 'AgentBuilderAdvanced', 2, NULL, NOW()),
(@menu_id, '执行记录', 'agent:builder:records', '/agent/builder/records', 'AgentBuilderRecords', 3, NULL, NOW());

-- 为管理员角色分配权限
INSERT INTO sys_role_menu (role_id, menu_id) 
SELECT 1, id FROM sys_menu WHERE code LIKE 'agent:builder%' OR code LIKE 'agent:builder:%';
```

### 5.2 权限点说明
| 权限码 | 说明 |
|--------|------|
| agent:builder | AI智能体搭建菜单 |
| agent:builder:simple | 简易智能体页面 |
| agent:builder:advanced | 高级智能体页面 |
| agent:builder:records | 执行记录页面 |

### 5.3 路由配置确认
`router/index.ts` 中已包含：
```typescript
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

## 六、部署配置

### 6.1 Docker部署
```dockerfile
# 后端Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/dist ./dist
EXPOSE 8080
CMD ["node", "dist/main"]
```

### 6.2 Nginx配置
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态文件
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
    
    # 后端API代理
    location /api/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 6.3 Docker Compose配置
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      - DB_DRIVER=mysql
      - DB_HOST=mysql
      - DB_NAME=fae_platform
    depends_on:
      - mysql
  
  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
  
  mysql:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=root
      - MYSQL_DATABASE=fae_platform
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

---

## 七、版本信息

- **版本**：V3.0
- **发布日期**：2026-08-09
- **适用平台**：飞虹智企业AI一站式平台
- **文档版本**：V1.0
