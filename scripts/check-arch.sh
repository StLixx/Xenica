#!/usr/bin/env bash
# 架构守卫：核心（xenica-core）不能依赖数据库、网络、运行时。
set -euo pipefail
cd "$(dirname "$0")/.."

forbidden='^(axum|sqlx|sqlx-core|tokio|tower|tower-http|hyper|reqwest) '
deps=$(cargo tree -p xenica-core -e normal --prefix none --format '{p}' | sort -u)
if bad=$(grep -E "$forbidden" <<<"$deps"); then
  echo "xenica-core 不允许依赖：" >&2
  echo "$bad" >&2
  exit 1
fi

# store 不能依赖 HTTP 层
deps=$(cargo tree -p xenica-store -e normal --prefix none --format '{p}' | sort -u)
if bad=$(grep -E '^(axum|xenica-server|utoipa-axum|tower-http) ' <<<"$deps"); then
  echo "xenica-store 不允许依赖：" >&2
  echo "$bad" >&2
  exit 1
fi
echo "architecture ok"
