## L2 / backend-core

> 这是 Xenica 项目的**第一个 L2 thread**。

## 来源

L1 architecture-foundation thread 的 handoff。

## 目标

实现 Phase 1 的最小可运行后端：建表、定义数据模型、跑通 API、写出 CLI 客户端、通过集成测试。

## 输入（继承自 L1 architecture-foundation）

- **场景定义**：[场景.md](场景.md) 中的 S1 + S7 + S6
- **数据流**：[数据流.md](数据流.md) 中的三条序列图
- **数据模型 ADR**：[data-model.md](data-model.md) — nodes + edges 两张表，含完整 DDL
- **API ADR**：[api-design.md](api-design.md) — 5 个端点，全同步
- **技术栈 ADR**：[tech-stack.md](tech-stack.md) — Rust + Axum + sqlx + PostgreSQL 17
- **架构图**：[架构图.md](架构图.md)
- **开发路线图**：[路线图.md](路线图.md) 中的 Phase 1 Step 1-6

## 范围

1. 项目骨架（cargo init + 依赖声明 + 目录结构）
2. 数据库 migration（nodes + edges 建表）
3. Rust 数据模型（Node/Edge 结构体 + sqlx 读写函数）
4. API 路由（Axum 5 个端点 + 统一错误响应）
5. CLI 客户端（clap 子命令 → HTTP 请求 → 格式化输出）
6. 集成测试（端到端走通 S1 → S7 → S6）

## 不在范围

- 前端 UI → Phase 1 defer
- PostgreSQL 扩展选型（pgvector/zhparser/pg_trgm/AGE）→ 留给后续 L2
- 异步 worker / 消息队列 → Phase 1 不需要
- 性能优化 → make it work 阶段不做
- 安全与访问控制 → Phase 1 单机本地，不需要

## 交付（交给 L3）

L2 产出模块架构和接口设计（ADR），然后 L3 开始写代码。

## 终止条件

以下全部完成后，本 thread 结束：
- 所有 L2 范围内的技术决策已写成 ADR
- 模块架构（Rust crate 结构、模块职责、接口契约）已定稿
- handoff 已产出，指向第一个 L3 thread 的范围
