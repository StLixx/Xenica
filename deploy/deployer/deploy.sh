#!/usr/bin/env bash
# 部署器：在 core-server 上由 systemd timer 每 2 分钟运行一次。只从 GitHub 和 ghcr「拉」，不接受任何推送。
#   正式站：ghcr 上的 latest 变了就换上；健康检查不过就回滚到上一个镜像，并记下这个坏版本。
#   预览：  本仓库分支提的每个打开的 PR 一个实例（pr-<号>.<域名>，带示例数据）；PR 关了就连数据一起删掉。
#           最近更新的那个 PR 同时挂在固定域名 preview.<域名> 上——用户只需要记这一个预览网址。
# 需要：docker（含 compose 插件）、curl、jq、openssl。配置读 deploy/.env。
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DEPLOY=$ROOT/deploy
ENV_FILE=$DEPLOY/.env
STATE=${XENICA_STATE:-/var/lib/xenica-deployer}
REPO=${XENICA_REPO:-StLixx/Xenica}
IMAGE=${XENICA_IMAGE_REPO:-ghcr.io/stlixx/xenica}
MAX_PREVIEWS=${XENICA_MAX_PREVIEWS:-6}

env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }
DOMAIN=$(env_get XENICA_HOST)
DOMAIN=${DOMAIN:-xenica.truebigsand.top}
TOKEN=$(env_get DEPLOYER_GITHUB_TOKEN)

mkdir -p "$STATE"
exec 9>"$STATE/lock"
flock -n 9 || exit 0

log() { echo "[deployer] $*"; }
compose() { docker compose -f "$DEPLOY/compose.yaml" "$@"; }
image_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }
revision() { docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2>/dev/null || true; }
running_image() {
  local cid
  cid=$(compose -p "$1" ps -q app 2>/dev/null | head -n 1)
  [ -n "$cid" ] && docker inspect -f '{{.Image}}' "$cid" 2>/dev/null || true
}
github() {
  local auth=()
  [ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")
  curl -fsS "${auth[@]}" -H 'Accept: application/vnd.github+json' "$@"
}

# 上线失败时开一个缺陷 Issue（有 token 才开），和其他问题走同一条管线。
report_failure() {
  local rev=$1 logs=$2
  log "prod: ${rev:0:7} failed health check, rolled back"
  [ -n "$TOKEN" ] || return 0
  # shellcheck disable=SC2016 # 反引号是 Markdown 代码块
  jq -n --arg t "上线失败：${rev:0:7}" --arg b "$(printf '部署器已自动回滚到上一个版本。\n\ncommit: %s\n\n```\n%s\n```' "$rev" "$logs")" \
    '{title: $t, body: $b, labels: ["缺陷"]}' |
    github -X POST "https://api.github.com/repos/$REPO/issues" -d @- >/dev/null || log "could not open issue"
}

deploy_prod() {
  docker pull -q "$IMAGE:latest" >/dev/null || { log "prod: pull failed"; return 0; }
  local want have rev
  want=$(image_id "$IMAGE:latest")
  have=$(running_image xenica)
  [ "$want" = "$have" ] && return 0
  [ "$want" = "$(cat "$STATE/prod.bad" 2>/dev/null)" ] && return 0
  rev=$(revision "$IMAGE:latest")
  log "prod: deploying ${rev:0:7}"
  [ -n "$have" ] && docker tag "$have" "$IMAGE:previous"
  if XENICA_IMAGE="$IMAGE:latest" compose -p xenica --env-file "$ENV_FILE" up -d --wait --wait-timeout 120; then
    log "prod: ${rev:0:7} is live"
    rm -f "$STATE/prod.bad"
    return 0
  fi
  local logs
  logs=$(compose -p xenica logs --tail 40 app 2>&1 || true)
  echo "$want" >"$STATE/prod.bad"
  if [ -n "$have" ]; then
    XENICA_IMAGE="$IMAGE:previous" compose -p xenica --env-file "$ENV_FILE" up -d --wait --wait-timeout 120 || log "prod: rollback also failed"
  fi
  report_failure "$rev" "$logs"
}

deploy_preview() {
  local n=$1 alias=$2 project="xenica-pr-$1" tag="$IMAGE:pr-$1" env_file="$STATE/pr-$1.env"
  docker pull -q "$tag" >/dev/null 2>&1 || return 0 # CI 还没推送镜像
  local want have rule=''
  want=$(image_id "$tag")
  have=$(running_image "$project")
  # 镜像没变、固定域名也没换主人就不动；换了主人要重建容器（Traefik 规则在容器标签上）
  [ "$want" = "$have" ] && [ "$alias" = "$(cat "$STATE/pr-$n.alias" 2>/dev/null)" ] && return 0
  [ -f "$env_file" ] || printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" >"$env_file"
  # shellcheck disable=SC2016 # 反引号是 Traefik 规则语法
  [ "$alias" = 1 ] && rule=" || Host(\`preview.$DOMAIN\`)"
  log "preview $n: deploying $(revision "$tag" | cut -c1-7)$([ "$alias" = 1 ] && echo " (preview.$DOMAIN)")"
  if XENICA_IMAGE="$tag" XENICA_NAME="pr-$n" XENICA_HOST="pr-$n.$DOMAIN" XENICA_ALIAS_RULE="$rule" XENICA_SEED=demo \
    compose -p "$project" --env-file "$env_file" up -d --wait --wait-timeout 120; then
    echo "$alias" >"$STATE/pr-$n.alias"
  else
    log "preview $n: not healthy"
  fi
}

deploy_previews() {
  local pulls open keep latest project n
  pulls=$(github "https://api.github.com/repos/$REPO/pulls?state=open&per_page=50") ||
    { log "github api failed"; return 0; }
  open=$(jq -r --arg r "$REPO" '[.[] | select(.head.repo.full_name == $r) | .number] | sort | reverse | .[]' <<<"$pulls")
  latest=$(jq -r --arg r "$REPO" '[.[] | select(.head.repo.full_name == $r)] | sort_by(.updated_at) | last | .number // empty' <<<"$pulls")
  keep=$(head -n "$MAX_PREVIEWS" <<<"$open")
  for n in $keep; do deploy_preview "$n" "$([ "$n" = "$latest" ] && echo 1 || echo 0)"; done
  for project in $(docker ps -a --format '{{.Label "com.docker.compose.project"}}' | grep -E '^xenica-pr-[0-9]+$' | sort -u); do
    n=${project#xenica-pr-}
    grep -qx "$n" <<<"$keep" && continue
    log "preview $n: removing"
    compose -p "$project" down -v --remove-orphans || true
    docker rmi "$IMAGE:pr-$n" >/dev/null 2>&1 || true
    rm -f "$STATE/pr-$n.env" "$STATE/pr-$n.alias"
  done
}

docker network inspect xenica-edge >/dev/null 2>&1 || docker network create xenica-edge >/dev/null
deploy_prod
deploy_previews
docker image prune -f >/dev/null 2>&1 || true
