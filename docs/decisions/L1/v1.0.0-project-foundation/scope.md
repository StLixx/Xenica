## L1 / project-foundation

> 这是 Xenica 项目的**第二个 L1 thread**。第一个是最初的探索 thread（其 handoff 即同目录下 `L1-project-foundation-2026-07-06.md`），那时尚未建立分层体系，讨论混在一起——从项目哲学到 PostgreSQL 扩展都在一个 thread 里。那个 thread 产出了宏观的架构和技术选型决策，但缺乏结构化的 ADR 输出。
>
> 本 thread 在此基础上，正式建立了 L1-L3 分层管理框架、文档体系、决策记录标准和工程原则。从此以后，每个 L 层的每个 thread 都有自己的文件夹、scope 定义、handoff 和 ADR。

## 目标
建立项目最顶层的管理框架：工作流规范、目录结构、文档体系、AI 协作约定。

## 范围
- AGENTS.md 的核心规则定义
- docs/ 目录结构设计
- L1-L3 分层 thread 管理体系
- Session Handoff 标准
- ADR 书写标准
- 工程原则体系

## 不在范围
- PostgreSQL 扩展选型 → 交给 L2
- 数据模型 schema 细节 → 交给 L2
- 任何具体代码实现 → 交给 L3

## 终止条件
- 所有 decisions/ 下的 ADR 已写出
- AGENTS.md 已定稿
- 原则体系已落盘
- handoff 已产出
