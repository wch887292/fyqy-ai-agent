#!/usr/bin/env bash
# ==========================================================
# 飞虹智-企业AI一站式平台 V1.0 停止脚本
# 研发主体：晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
#
# 用法：
#   ./stop.sh            仅停止容器，数据保留
#   ./stop.sh --purge    停止并删除数据卷（不可恢复）
# ==========================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

if [ "${1:-}" = "--purge" ]; then
  echo "警告：该操作将删除 MySQL / MinIO / Milvus 全部数据，且不可恢复。"
  read -r -p "确认请输入 yes：" ans
  if [ "$ans" = "yes" ]; then
    $DC down -v
    echo "[飞扬企源] 服务已停止，数据卷已清空"
  else
    echo "[飞扬企源] 已取消"
  fi
else
  $DC down
  echo "[飞扬企源] 服务已停止，数据保留。重新启动请执行 deploy/start.sh"
fi
