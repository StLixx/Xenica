#!/usr/bin/env bash
# 一次性仓库设置，可重复运行。需要 gh 已登录且对仓库有管理员权限。
# 只允许 squash；master：必须走 PR、CI 和验收门必须通过、禁止强推和删除。
set -euo pipefail
repo=${1:-StLixx/Xenica}

gh api -X PATCH "repos/$repo" \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F allow_auto_merge=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY >/dev/null

ruleset='{
  "name": "master",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"] } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "rust" }, { "context": "web" }, { "context": "e2e" }, { "context": "docker" },
          { "context": "screenshots" }, { "context": "验收" } ] } }
  ]
}'

id=$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name == "master") | .id')
if [ -n "$id" ]; then
  gh api -X PUT "repos/$repo/rulesets/$id" --input - <<<"$ruleset" >/dev/null
else
  gh api -X POST "repos/$repo/rulesets" --input - <<<"$ruleset" >/dev/null
fi
echo "done: https://github.com/$repo/settings/rules"
