## ADR / L1 / project-foundation / L1-L3 分层 thread 管理体系

**状态**: accepted
**日期**: 2026-07-06
**来源 thread**: project-foundation

## Context

项目管理需要一个分层方式以节约上下文、合理使用 token。上一个探索 thread 把所有讨论（从项目哲学到 PostgreSQL 扩展）混在一个 thread 里，上下文很快被占满，决策边界模糊。

## Decision

### 分层视角

分层是一种理解架构的视角，不是僵化的权限表。它的核心作用是**节约上下文**和**保持焦点**——每个 thread 只处理自己这个层次的关注点，不被其他层次的细节干扰。

| 层级 | 关注点 | 典型讨论内容 |
|------|--------|-------------|
| L1 | 方向与边界 | 项目往哪走、模块怎么划分、文档体系怎么组织 |
| L2 | 模块架构 | 某个模块的数据模型、API 契约、技术选型评估 |
| L3 | 代码实现 | 具体 Rust 代码、migration、测试 |

层次之间的"可以改什么 / 不可以改什么"由具体 thread 的 scope.md 划定，不在此处一刀切。唯一硬性规则：**genesis/ 在所有层级都是只读的**——这是项目的基准线。

### 同层单一 thread

每个层级同一时间只维护一个活跃 thread。同时维护两个 L2 thread 会带来认知过载——人脑一次只能处理约 4 个组块，两个并行的模块设计会互相干扰。上一个 thread 结束（产出 handoff）后，才能开同层的下一个 thread。

### 跨层流转机制

以 L2 为例：

1. L2 thread 运行中，产出设计文档和 ADR
2. L2 thread 结束，产出 handoff
3. L1 读取 L2 的 handoff，与用户讨论
4. L1 产出下一个 L2 thread 的 scope
5. 新 L2 thread 开始时，引用两样东西：
   - 上一个 L2 的 handoff（了解已经做了什么、为什么那样做）
   - 自己的 scope（知道本次边界和终止条件）
6. L1 也可以开设一个专门的"路线图维护" thread，动态跟踪和调整各层的优先级和方向

## Rationale（用户直接阐述的思考）

[用户]：像目前这样只有一个 L1 thread、没有 L2 和 L3，是最简单的起点。新开 L2 时，它的 scope 应该由 L1 指定——L1 负责方向。等各层都建立起来之后，L2 结束一个 handoff，L1 读了 handoff 决定接下来 L2 往哪个方向走。不要让一个层同时跑多个 thread，大脑承担不过来。

## Alternatives Considered

- **同层多 thread 并行**：上下文碎片化，用户认知过载。放弃。
- **扁平不分层**：所有讨论混在一个 thread，上下文迅速耗尽。上一个探索 thread 就是反例。放弃。
- **自动多 Agent 系统**：调研发现 Anthropic 等公司有成熟的 Multi-Agent 体系，但那是自动化的——它不让你了解全过程。本项目的目标是边学边做、全权掌控。放弃。

## AI Role

[AI]：调研了 Anthropic Context Engineering 的四策略（Write/Select/Compress/Isolate），为 ISOLATE 策略提供了理论基础。调研了 JetBrains 关于 context window 管理的论文，提供了"context window 容量有限"的量化依据。设计了具体的流转步骤。

## Consequences

- ✅ 每个 thread 上下文精简，信号密度高
- ✅ 层级之间通过 handoff 和 scope 明确交付
- ✅ 用户能清晰追踪每个决策出自哪个 thread
- ⚠️ 跨层流转需要 L1 主动读取 L2 handoff——如果 L1 不及时响应，L2 会处于等待状态
- ⚠️ 初期用户只有一个 L1 thread，L2/L3 都是空的，需等到 L1"路线图"定下来后才启动
