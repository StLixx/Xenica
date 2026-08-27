## L1 / project-foundation — handoff

**日期**: 2026-07-06

## Current State

项目完成了从"探索期"到"有方法的建设期"的过渡。

- L1-L3 分层 thread 管理体系已建立
- docs/ 重新组织为 6 个顶层目录：about / genesis / decisions / principles / inbox / archive，公开/私有边界清晰
- 21 条通用工程原则已落盘，覆盖设计、代码、节奏、思维、AI 协作五个领域，原则可演进
- ADR 标准已定：三段式（what + why + avoided），区分用户思考与 AI 贡献，元数据放 `##` 行
- AGENTS.md 和 README.md 已定稿
- 旧探索 thread（2026-07-06）的 handoff 已归档在 `decisions/L1/v1.0.0-project-foundation/` 下
- backend/ 和 frontend/ 仍为空

## Decisions Made

本 thread 产出了 6 个 ADR（均在 `decisions/L1/v1.0.0-project-foundation/`）：

1. **thread-layers** — L1-L3 分层体系，同层单 thread，跨层由上级读 handoff 后开 scope
2. **session-handoff** — handoff 四个字段 + 命名 `[层级]-[主题]-[日期].md` + 同目录与 ADR 共存
3. **docs-structure** — 6 顶层公开/私有分离，decisions 按层级→thread 组织
4. **adr-standard** — 必要字段、what/why/avoided 三段式、用户思考 vs AI 角色、元数据放第一行
5. **principles-system** — 21 条原则可演进，AGENTS.md 交叉引用
6. **workflow** — scope → 聚焦讨论 → 产出 ADR → handoff → commit → push 的完整流转

## Context for Next Thread

下一个 L1 thread 的职责：**将旧探索 thread 中未结构化的架构决策归档为正式 ADR，并划定第一个 L2 thread 的范围**。

旧探索 thread 的 handoff（`L1-project-foundation-2026-07-06.md`）包含了宏观的架构和技术选型，但未写成 ADR 格式。需要提取以下主题，逐条写成正式 ADR：

- 数据模型：nodes + edges 两张表，属性即节点
- 类型系统：软类型 + 自由文本边标签
- API 风格：REST/Action，围绕领域动作设计
- 后端优先，前端 defer
- 技术选型：PostgreSQL 17 + Rust + Axum + sqlx

此外，旧 handoff 中提到了但用户未在本 thread 或旧 thread 中确认的决策（pgvector/zhparser/pg_trgm/AGE 扩展选型、PG LISTEN/NOTIFY 异步方案细节）——不要写入 ADR。它们将作为第一个 L2 thread（PostgreSQL 模块）的 scope 输入。

下一个 L1 thread 的 scope 还应包括：
- 构建 about/ 下的入门文档（项目概览、架构图、术语表）
- 根据已确认的架构决策，制定第一版开发路线图
- 划定第一个 L2 thread 的 scope

## Immediate Next Steps

1. 开 L1 thread：命名为 `architecture-foundation`
2. 写 scope.md——明确本 thread 只做架构归档和路线图，不做具体模块设计
3. 从旧 handoff 中逐条读取架构决策，用户逐条确认后写成 ADR
4. 产出 about/ 下的 project 概览和架构说明
5. 定义第一个 L2 thread 的 scope
