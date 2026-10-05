# 架构

本文件描述「现在是什么」。为什么这样选，见 `decisions.md`。

## 客户端顺序

Web → Desktop（Electron，复用 Web 的构建产物）→ Mobile（到时再选型）。只有一套后端，所有客户端共用。

## 分层

从最稳定到最易变：

| 层 | 位置 | 变更规则 |
| --- | --- | --- |
| 数据模型 | `server/crates/storage/migrations` | 只追加 migration，不修改已合并的 |
| 契约 | `contracts/openapi.yaml` | 只新增字段和端点；破坏性变更要开新版本并写决策记录 |
| 领域逻辑 | `server/crates/domain` | 可以重构，靠测试保证 |
| 服务实现 | `server/crates/storage`、`server/crates/api` | 可以重构，靠契约测试保证 |
| 客户端核心 | `packages/client-core` | 可以重构 |
| 视图与 UI | `apps/*` | 最易变，可以整体替换 |

```text
apps/web ──────┐
apps/desktop ──┼──> packages/client-core ──HTTP（契约）──> server/api ──> server/domain
apps/mobile ───┘                                              └──> server/storage ──> PostgreSQL
```

- `domain` 是纯逻辑，不做 IO，不依赖任何其他 crate。
- `storage` 只依赖 `domain` 的类型。
- `api` 组合 `domain` 和 `storage`，按契约实现端点。

## 数据模型 v0

| 实体 | 字段 | 说明 |
| --- | --- | --- |
| Node | id, title, body, props, created_at, updated_at, deleted_at, version | 任务、笔记等一切条目 |
| Edge | id, source_id, target_id, type, props, created_at, updated_at, deleted_at, version | `type = blocks` 表示 source 完成后 target 才能开始 |
| View | id, kind, name, config, created_at, updated_at, deleted_at, version | `kind`：`graph`，以后会有 `list`、`calendar` 等 |
| ViewItem | view_id, node_id, x, y, pinned, updated_at, version | 节点在某个视图里的位置 |

- `props` 是 JSON 对象。Phase 1 只用到 `done: boolean`。新增属性就是新增键，并写进契约。
- 节点「可做 / 等待 / 完成」是派生状态，由 `client-core` 计算，不存储。

## 不变量

1. 后端是唯一事实来源。客户端只通过契约访问后端，不直连数据库。
2. UI 不直接发请求，所有数据访问都经过 `client-core`。
3. ID 使用 UUIDv7，允许客户端生成。
4. 删除只写墓碑（`deleted_at`），不做物理删除。
5. 每次写入都从全局序列取 `version`。客户端通过 `GET /v1/sync?since=<version>` 增量拉取，结果包含墓碑。
6. 视图状态（位置、钉住、折叠）存在视图上，不存在节点上。
7. 领域规则（例如 `blocks` 边不能成环）由服务端 `domain` 层强制执行。客户端可以预检，但以服务端为准。
8. 时间一律按 UTC 存储，用 ISO 8601 传输。

## 技术栈

| 用途 | 选型 |
| --- | --- |
| 后端 | Rust、Axum、sqlx、PostgreSQL 17 |
| 契约 | OpenAPI 3.1（手写）；TS 类型用 openapi-typescript 生成，请求用 openapi-fetch |
| 前端 | TypeScript、React、Vite；服务端状态用 TanStack Query；图视图用 React Flow（@xyflow/react）和 ELK.js |
| 测试 | cargo test、Vitest、Playwright |
| 工程 | pnpm workspace、Cargo workspace、docker compose（本地 PG）、GitHub Actions |

## 目录

```text
AGENTS.md            Agent 入口
contracts/           OpenAPI 契约
server/              Rust workspace：crates/{domain,storage,api,xenica-server}
packages/client-core 各客户端共用的数据层
apps/web             Web 客户端
apps/desktop         Electron（Phase 2）
docs/                architecture、decisions、tasks；prototypes/ 存放交互原型
```

## 现在不做

以下内容到对应阶段再决定：离线编辑与冲突合并、实时推送（SSE / WebSocket）、多用户与正式认证（Phase 1 只有一个用户，用一个固定的 Bearer token 保护）、搜索、文件附件、Mobile 端、地点与触发器。
