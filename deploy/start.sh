#!/usr/bin/env bash
# ==========================================================
# 飞虹智-企业AI一站式平台 V2.0 一键部署脚本（Linux / macOS）
# 研发主体：晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
# 项目负责人：吴赐虹
# ==========================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${GREEN}[飞扬企源]${NC} $*"; }
warn() { echo -e "${YELLOW}[提示]${NC} $*"; }
fail() { echo -e "${RED}[错误]${NC} $*" >&2; exit 1; }

# ---------- 1. 环境检查 ----------
info "检查 Docker 运行环境..."
command -v docker >/dev/null 2>&1 || fail "未检测到 docker，请先安装 Docker 20.10 及以上版本"
docker info >/dev/null 2>&1 || fail "Docker 服务未启动，请先执行 systemctl start docker"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  fail "未检测到 docker compose 插件，请安装 Docker Compose V2"
fi
info "Docker 环境正常，使用命令：$DC"

# ---------- 2. 准备配置 ----------
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  warn "已由 .env.example 生成 .env，生产环境请务必修改 JWT_SECRET 与各项密码后重新执行本脚本"
fi

# shellcheck disable=SC1091
set -a; source "$ROOT/.env"; set +a
FRONTEND_PORT="${FRONTEND_PORT:-8000}"

# ---------- 3. 构建并启动 ----------
info "开始构建镜像，首次执行需拉取基础镜像，请耐心等待..."
$DC build

info "启动全部服务（MySQL / MinIO / etcd / Milvus / 后端 / 前端）..."
$DC up -d

# ---------- 4. 等待服务就绪 ----------
info "等待后端健康检查通过（Milvus 首次启动约需 1-2 分钟）..."
BACKEND_PORT="${BACKEND_PORT:-8080}"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    info "后端服务已就绪"
    break
  fi
  if [ "$i" -eq 60 ]; then
    warn "后端在 5 分钟内未就绪，请执行 $DC logs -f backend 查看日志"
  fi
  sleep 5
done

# ---------- 5. 输出结果 ----------
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "${IP:-}" ] && IP="localhost"

echo ""
info "======================================================"
info " 飞虹智-企业AI一站式平台 V2.0 部署完成（OpenClaw 智能体 / 合伙人自动分利 / 简易生产工单 / 站内消息 / 批量导入导出）"
info "======================================================"
echo "  访问地址      http://${IP}:${FRONTEND_PORT}"
echo "  后端接口      http://${IP}:${BACKEND_PORT}/api"
echo ""
echo "  演示账号（初始密码 123456）"
echo "    admin      企业管理员    全模块权限"
echo "    sales01    销售主管      本部门数据"
echo "    sales02    销售专员      仅本人数据"
echo "    partner01  区域合伙人    合伙人中心"
echo "    stock01    仓储主管      进销存"
echo "    superadmin 平台超管      密码 admin@2026"
echo ""
echo "  常用命令"
echo "    查看日志    $DC logs -f backend"
echo "    停止服务    $DC down"
echo "    清空数据    $DC down -v"
info "======================================================"
