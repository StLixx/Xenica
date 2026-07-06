## ADR / L1 / architecture-foundation / API 设计：REST/Action + Phase 1 全同步

**状态**: proposed
**日期**: 2026-07-06
**来源 thread**: architecture-foundation

## Context

需要为 S1（写入）、S7（单节点读）、S6（全量读）三个场景定义 API 形态。旧探索 thread 中已讨论过 REST/Action vs GraphQL，结论是无争议的 REST/Action。但那个讨论缺少对"为什么 Phase 1 不需要异步"的论证——本 ADR 在场景数据流的基础上补全。

## Decision

### API 端点

| 端点                          | 对应场景 | 说明                                |
| --------------------------- | ---- | --------------------------------- |
| `POST /nodes`               | S1   | 创建节点，可附带要连接的已有节点 ID 列表及每条边的 label |
| `GET /nodes/{id}`           | S7   | 获取节点详情                            |
| `GET /nodes/{id}/neighbors` | S7   | 获取该节点的一层邻居（含边 label 和方向）          |
| `GET /nodes`                | S6   | 获取所有节点                            |
| `GET /edges`                | S6   | 获取所有边                             |

### Phase 1 全同步

所有端点都是同步的请求-响应。API Server 接收 HTTP 请求，在一个事务中读写 PostgreSQL，直接返回结果。

不引入消息队列、不引入异步 worker、不引入 WebSocket。

### Why（追溯到场景）

- **端点围绕领域动作设计**：`POST /nodes` 是"创建一个节点"，`GET /nodes/{id}/neighbors` 是"看它的邻居"——这些是用户脑子里的动作，不是数据库的表映射。S1/S7/S6 三条数据流中没有任何一步需要绕过业务逻辑暴露表结构
- **全同步**：三个场景的数据流分析显示，所有操作都是单次请求-响应的短耗时任务。S1 是一次 INSERT + 几次 INSERT 在一个事务中，S7 是一次 JOIN 查询，S6 是两次全表扫描。没有长耗时的多步骤任务，没有需要后台跑的东西
- **第 5 个端点 `GET /edges`**：S6 的"全局视图"需要节点列表和边列表两个数据集。分成两个端点而不是一个聚合端点，是因为全局图渲染需要边作为独立的数据层——这是前端渲染的天然输入

### What was avoided

- **GraphQL**：不引入。Phase 1 的查询模式极其固定（单节点、邻居、全量），GraphQL 的灵活性对三个端点来说是过度设计。放弃 GraphQL 也是旧探索 thread 中用户认可的结论
- **消息队列 / 异步 worker**：不在 Phase 1 引入。S1/S7/S6 没有长耗时任务。S3（AI 对话节点化）、S5（课程爬取）引入时会需要异步，届时在对应的 L2 thread 中作为新 ADR 决策——不在现在预测和预留
- **WebSocket / 长连接**：不引入。Phase 1 没有实时推送需求

## Rationale（用户直接阐述的思考）

[用户]：场景推架构——S1/S7/S6 的数据流画出来就是同步的，不需要异步。问题是什么就答什么，不多引入复杂度。API 围绕"用户做的事"而不是"数据库的表"来设计，这对应 Genesis 里的"工程实现与交互直觉的解耦"。

## Alternatives Considered

- **GraphQL**：灵活，但 Phase 1 不需要。放弃。如果将来前端需要灵活查询，可以在 L2 引入——但 YAGNI
- **CRUD 风格（`/api/nodes` + `/api/edges` 各一套 RESTful）**：把 API 当成表的透传。放弃——这不是用户心里想的动作，是把数据库的物理结构暴露给了接口层
- **PATCH /nodes/{id} 更新内容**：Phase 1 不做。更新操作不在三个场景中。需要时在对应的 L2 场景中加

## AI Role

[AI]：从 S1/S7/S6 的数据流图推导出 5 个 API 端点的最小集。论证了 Phase 1 全同步的合理性（3 个场景均无长耗时任务）。与旧探索 thread 的 "REST/Action，不用 GraphQL" 结论保持了一致。

## Consequences

- ✅ 5 个端点纯净而且对称——2 个写/3 个读，覆盖全部 Phase 1 场景
- ✅ 全同步让错误处理简单——请求失败就是失败，不需要管理异步任务的状态机
- ⚠️ `GET /nodes` 和 `GET /edges` 在数据量增长后会是性能瓶颈——Phase 1 数据量小时不是问题。Phase 2 需要分页或增量加载方案
- ⚠️ 更新和删除操作没有端点——Phase 1 先不做。但 CLI 用户可能需要修复输入错误，在 L2 中作为改进加入
