#!/usr/bin/env bash
# AGENTS.md 是每个 Agent 的开场上下文，必须短。超了就先压缩或删除，不能只往里加。
set -euo pipefail
cd "$(dirname "$0")/.."
max=200
lines=$(wc -l < AGENTS.md)
if [ "$lines" -gt "$max" ]; then
  echo "AGENTS.md 有 $lines 行，上限 $max。先压缩或把内容变成检查/测试。" >&2
  exit 1
fi
echo "AGENTS.md: $lines/$max lines"
