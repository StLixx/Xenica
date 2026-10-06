# 0003 模块边界

状态：已采纳 · 2026-10

## 决定

后端三层，依赖只能向下：

```
server（HTTP） → store（PostgreSQL） → core（原语和规则）
```

core 不依赖 sqlx、axum、tokio；store 不依赖 HTTP。`scripts/check-arch.sh` 用 `cargo tree` 检查。

前端四层：

```
views → shell/api.ts、api、ui
shell → api、ui
api   → （只有它能用 openapi-fetch）
ui    → （叶子，什么都不 import）
```

视图之间不互相 import，要跳转就通过工作台 `openView`。规则写在 `web/.dependency-cruiser.cjs`，`pnpm arch` 检查。

## 理由

- 代码主要由不同的 AI 模型分片段写。每个片段只该碰一个视图目录或一个路由文件；边界由工具强制，模型越界会直接 CI 失败。
- 视图互不依赖，才能单独删除、替换、做成插件（规则 5）。
- 前端类型从 OpenAPI 生成，前后端不会悄悄对不上。
