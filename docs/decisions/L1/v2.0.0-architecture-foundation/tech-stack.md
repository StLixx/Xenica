## ADR / L1 / architecture-foundation / 技术栈：Rust + Axum + sqlx + PostgreSQL 17

**状态**: accepted
**日期**: 2026-07-06
**来源 thread**: architecture-foundation

## Context

需要一个技术栈来支撑 Phase 1 的 S1/S7/S6 三个场景。旧探索 thread 中用户已做过技术选型论证（PostgreSQL 17 亲自选型，Rust + Axum + sqlx 已被解释并认可），但缺少"这些选择为什么能支撑具体场景"的论证。

Phase 1 的操作特征：全部同步、HTTP 请求-响应、对 PostgreSQL 做直接读写。没有长耗时异步任务、没有高并发、没有静态文件服务、没有 WebSocket。

## Decision

| 组件     | 选型         | 版本            |
| ------ | ---------- | ------------- |
| 后端语言   | Rust       | stable 1.93.0 |
| Web 框架 | Axum       | 最新            |
| 数据库驱动  | sqlx       | 最新            |
| 数据库    | PostgreSQL | 17            |

### Why（追溯到场景）

- **Rust**：三个场景的数据流都是"接收 HTTP 请求 → 读写 PG → 返回 JSON"。Rust 的编译器保证了错误分支不被遗漏（`?` 操作符），对一个新手中途接手/长期维护的项目来说，编译期的正确性比开发速度快慢更有价值。S1 的"创建节点+创建多条边"在一个事务中——如果 Rust 编译器强制处理了每个 `Result`，事务的 ACID 就不会被吞掉的错误破坏
- **Axum**：Tokio 团队维护，是 Rust 生态中 HTTP 框架的事实标准。S1-S6 的同步 API 用 Axum 的直接 async handler 足够，不需要中间件层。生态对齐原则"成熟技术优先"
- **sqlx**：编译期 SQL 检查。S7 的 JOIN 查询 `edges JOIN nodes ON target_id = nodes.id`——如果 SQL 写错了列名，`cargo build` 就会报错，而不是等到运行时。这对降低推理成本有显著价值
- **PostgreSQL 17**：S1/S7/S6 的数据模型就是两张表加两个索引，任何 SQL 数据库都能做。但 PG 的 `gen_random_uuid()`、事务完整性、以及未来 Phase 2+ 需要的 `pgvector`/`pg_trgm`/zhparser 扩展都只在 PG 上有——现在选了 PG 等于把未来的扩展坡道铺好了，不需要在 Phase 2 换数据库

### What was avoided

- **ORM（Diesel/SeaORM）**：不引入。两张表的查询用手写 SQL 比 ORM 更直观。S7 的邻居 JOIN 查询用 ORM 写会更长更绕。sqlx 的编译期检查已经提供了 ORM 最大的优点（类型安全），不需要 ORM 的查询构建抽象层
- **Node.js / Python**：不纳入。旧探索 thread 中用户已论证 Rust 作为后端语言。不做 re-litigation
- **PostgreSQL 扩展（pgvector, zhparser, pg_trgm, AGE）**：不在 Phase 1 安装。Phase 1 不需要向量搜索、中文分词、模糊匹配、图查询——两张表 + 纯 SQL 就够了。在对应的 L2 thread 中单独评估和决策

## Rationale（用户直接阐述的思考）

[用户]：选型标准之前已经说得很清楚——优先成熟（3 年 + 口碑好）的技术栈，不做 experimental。Rust + Axum + sqlx + PG 17 这个组合是 Rust 后端的事实标准套餐，社区活跃、文档齐全、AI 对它们的代码生成质量也最高。另一个关键理由是：编译器检查的价值——自己写代码容易漏错误分支，`cargo build` 帮你找到，这在 long-running 的个人项目中比"第一版写得快"重要得多。

## Alternatives Considered

- **Diesel ORM**：Rust 生态最成熟的 ORM，Phase 1 两张表的查询不需要它的 DSL。放弃
- **SeaORM**：比 Diesel 更活跃的 async ORM。同理，两张表不需要
- **tokio-postgres（裸驱动，不用 sqlx）**：可行，但没有编译期 SQL 检查。sqlx 的 `query!` 宏是零成本抽象——不影响运行时性能，但影响开发时的出错概率。选 sqlx 不用裸驱动
- **Actix-web 替代 Axum**：Actix 用 actor 模型，Axum 用 tower service。Axum 是 Tokio 官方出品，生态集成更无缝，且新项目更推荐 Axum。放弃 Actix

## AI Role

[AI]：基于 S1/S7/S6 的数据流特征（同步、HTTP、直接读写 PG）验证了旧探索 thread 的技术选型是否匹配。分析了 sqlx 编译期检查对 S7 JOIN 查询的具体价值、PG 17 对未来扩展的兼容性。论证了"不用 ORM"在小项目中的合理性。

## Consequences

- ✅ 四个组件都是各自领域的成熟选择，AI 代码生成质量高
- ✅ sqlx 编译期 SQL 检查降低了 Phase 1 写 SQL 的出错的概率
- ✅ PG 17 的扩展生态为 Phase 2+ 铺好路
- ⚠️ Rust 的学习曲线比 Python/Node 高——但用户自己选了这条路
- ⚠️ sqlx 的 `query!` 宏需要编译时连接数据库（或 `offline` 模式）——在 CI 中需要额外配置。Phase 1 本地开发不受影响
