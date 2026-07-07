## L1 / architecture-foundation — handoff

**日期**: 2026-07-06

## Current State

项目完成了第一个正式的 L1 架构设计 thread。核心转变：从"按主题归档旧讨论"改为"从 Genesis 场景出发推导架构"。

- 从 Genesis（`docs/genesis/背后的问题.md`）提炼出 10 个使用场景，Phase 1 选定 S1（知识录入与连接）+ S7（聚焦式节点探索）+ S6（知识图谱导航）
- 三条场景的数据流已画出（Mermaid 序列图），每条数据流直接推导出组件、接口、数据模型
- 3 个 ADR 已定稿：数据模型（nodes + edges 两张表）、API 设计（REST/Action + 全同步）、技术栈（Rust + Axum + sqlx + PG 17）
- L1 架构图已产出（C4 System Context + Container）
- Phase 1 开发路线图已定，6 步从项目骨架到集成测试
- 第一个 L2 thread（backend-core）的 scope 已定义
- 三条新工程原则（最小可行架构、演进式架构、Emergent 与 Intentional 的平衡）已写入 principles/

## Decisions Made

本 thread 产出了 3 个 ADR（均在 `decisions/L1/architecture-foundation/`）：

1. **data-model** — nodes + edges 两张表，属性即节点，边 label 自由文本，Phase 1 不做类型约束和软删除
2. **api-design** — 5 个 REST/Action 端点，Phase 1 全同步，不用 GraphQL / 消息队列 / WebSocket
3. **tech-stack** — Rust + Axum + sqlx + PostgreSQL 17，不用 ORM

3 条新原则：
4. **最小可行架构** — 给接下来要降落的飞机铺够跑道，不建整条机场
5. **演进式架构** — 架构不是一次性产物，是持续校准的努力
6. **Emergent 与 Intentional 的平衡** — 错了代价大的提前定，改起来便宜的边写边冒

## Context for Next Thread

下一个 L1 thread 的职责：**进度审核**——检查第一个 L2 thread（backend-core）的产出是否符合本 thread 确定的架构方向。

具体来说：
- 数据模型是否严格遵循了 nodes + edges 两张表、属性即节点？
- API 是否围绕领域动作设计，没有暴露表结构？
- 有没有在 Phase 1 引入不该引入的东西（ORM、消息队列、PG 扩展）？
- CLI 客户端是否能端到端走通 S1 → S7 → S6？

审核不需要产出新的 ADR（除非发现偏离需要纠正），主要产出是审核记录和"通过/需修正"的判断。

此外，本 thread **尚未产出 about/ 下的入门文档**（项目概览、术语表）。上一个 project-foundation thread 的 handoff 提到了这一项，但本 thread 聚焦于架构设计本身，about/ 文档更适合在 Phase 1 代码跑通、有了 tangible 的东西之后再写——届时术语表有实际的 API 和命令可以引用。

## Future Concerns（已讨论但不在 Phase 1）

以下话题在本 thread 中经过讨论，确认不需要在当前 schema 中预留，但在 Phase 2+ 需要单独决策。

### 边即节点（Edge Reification）

用户可以在未来通过创建新节点来描述一条边——例如围绕"A connected_to B"这条边的语义写一段思考。当前两张表模型已天然支持这个路径（新节点 + 边指向 A 和 B），不需要在 edges 表上加 `meta_node_id` 列。RDF* / SPARQL* 等成熟方案可供未来参考，但不是 Phase 1 的内容。

### 视图模板（Views）

Blog 发布、白板布局、UML package 容器渲染等场景需要在未来持久化"视图配置"——节点坐标、渲染样式、容器嵌套关系。这些信息属于呈现层，与知识本体（nodes + edges）逻辑独立。Phase 2+ 需要新增 `views` + `view_items` 表，届时作为独立 ADR 决策。

### MCP 集成

MCP（Model Context Protocol）是 AI Agent 与外部系统之间的标准连接层，不替代 REST API，而是在其上增加运行时工具发现和会话语境。未来 Xenica 接入 Agent 时需要新增 MCP Server 进程，内部调 API Server 或直查 PG，对外暴露 Tools/Resources/Prompts。MCP Server 不仅是后端透传层——它需要承载视图配置的读写，跨越数据层和呈现层。属于 Phase 2+ 架构扩展。

### Worker 四队列

异步任务的标准模式包括四个队列：Scheduled Queue（定时）→ Main Queue（主）→ Retry Queue（重试，指数退避）→ Dead Letter Queue（死信）。当前 Phase 1 全同步不需要任何队列，后续 L2 异步场景 thread 负责设计。

## Immediate Next Steps

- Phase 1 后端已实现并端到端验证通过（L3 commit: Phase 1 后端实现，2026-07-06）
- 3 条 ADR（data-model / api-design / tech-stack）已从 proposed → accepted
- 下一阶段：L1 thread `core-capabilities`（从 Phase 1 架构扩展到搜索、异步、导入管道）
