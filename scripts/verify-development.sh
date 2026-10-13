#!/usr/bin/env bash
# 持续自检入口；在 Infra 的已连接数据库和既有工具链上执行。
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" = Linux ]] || { echo 'Build and test require Infra'; exit 1; }
: "${DATABASE_URL:?verified Infra database required}"
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
bash scripts/check-arch.sh
bash scripts/check-docs.sh
node --test .github/scripts/tests/*.test.cjs
node scripts/check-context.cjs
python3 scripts/test-excalidraw-archive.py
python3 scripts/test-deployer.py
python3 scripts/test-history.py
python3 scripts/test-workspace.py
pnpm -C web format:check
pnpm -C web lint
pnpm -C web typecheck
pnpm -C web test
pnpm -C web arch
pnpm -C web build
pnpm -C web build-storybook --quiet
node scripts/generate-design-catalog.cjs --check
pnpm -C web screenshots --update-snapshots=all
echo 'Static and database verification completed. Real deployed browser and runtime restore checks are separate required gates.'
