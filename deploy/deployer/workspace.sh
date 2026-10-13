#!/usr/bin/env bash
# 固定开发画板有自己的持久数据库，与 PR 生命周期和正式应用升级无关。
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CONFIG=${XENICA_WORKSPACE_CONFIG:-/var/lib/xenica-workspace/workspace.env}
[[ -f "$CONFIG" ]] || { echo 'Workspace requires private configuration'; exit 1; }
set -a
source "$CONFIG"
set +a
[[ "${XENICA_IMAGE:-}" =~ ^ghcr\.io/stlixx/xenica@sha256:[a-f0-9]{64}$ ]] || exit 1
export XENICA_ARTIFACT=${XENICA_IMAGE#*@}
export XENICA_NAME=sketch
export XENICA_HOST=excalidraw.xenica.truebigsand.top
export XENICA_SEED=''
export XENICA_ALLOWED_ACCOUNT=test
export XENICA_PRIORITY=1000
export XENICA_ALIAS_RULE=''
# 备份失败时不替换运行产物；数据卷不会随临时预览关闭。
if docker inspect xenica-sketch-app-1 >/dev/null 2>&1; then
  previous=$(docker inspect xenica-sketch-app-1 --format '{{.Config.Image}}')
  backup=/var/lib/xenica-workspace/backups/$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -p "$backup"; chmod 700 "$backup"
  docker exec xenica-sketch-db-1 pg_dump --no-owner --no-acl -U xenica xenica > "$backup/database.sql"
  chmod 600 "$backup/database.sql"
  docker inspect xenica-sketch-app-1 --format '{{.Config.Image}}' > "$backup/image"
fi
docker pull -q "$XENICA_IMAGE" >/dev/null
if ! docker compose -f "$ROOT/deploy/compose.yaml" -p xenica-sketch --env-file "$CONFIG" up -d --wait --wait-timeout 120; then
  if [ -n "${previous:-}" ]; then
    export XENICA_IMAGE=$previous XENICA_ARTIFACT=${previous#*@}
    docker compose -f "$ROOT/deploy/compose.yaml" -p xenica-sketch --env-file "$CONFIG" up -d --wait --wait-timeout 120
  else
    docker compose -f "$ROOT/deploy/compose.yaml" -p xenica-sketch --env-file "$CONFIG" stop app
  fi
  exit 1
fi
