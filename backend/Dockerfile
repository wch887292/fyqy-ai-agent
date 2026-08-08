# ==========================================================
# 飞虹智-企业AI一站式平台 V1.0 后端镜像
# 研发主体：晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
# 项目负责人：吴赐虹
# ==========================================================

# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder

WORKDIR /app

# better-sqlite3 等原生模块需要编译工具链
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json nest-cli.json ./
COPY src ./src

RUN npx tsc -p tsconfig.json

# ---------- 运行阶段 ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

RUN apk add --no-cache tzdata curl \
    && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

# 仅安装生产依赖，减小镜像体积
RUN apk add --no-cache --virtual .build-deps python3 make g++
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && apk del .build-deps

COPY --from=builder /app/dist ./dist

# 本地存储与 SQLite 落盘目录（prod 模式下由 MySQL/MinIO 接管，此处仅兜底）
RUN mkdir -p /app/data/uploads

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["node", "dist/main.js"]
