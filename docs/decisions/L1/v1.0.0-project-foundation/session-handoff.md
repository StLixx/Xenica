## ADR / L1 / project-foundation / Session Handoff 标准

**状态**: accepted
**日期**: 2026-07-06
**来源 thread**: project-foundation

## Context

上一个探索 thread 结束时产出了 `session-context-2026-07-06.md`，但没有标准格式——12 个大段混在一起，决策和非决策不分。需要建立标准化的 handoff 格式，使得下一个 thread 无需重读全部对话记录就能接上。

## Decision

### 命名

`[层级]-[主题]-[YYYY-MM-DD].md`，例如 `L1-project-foundation-2026-07-06.md`。与同 thread 的 scope.md、ADR 文件放在同一个文件夹下——打开一个文件夹能看到这个 thread 的全部产出。

### 必须包含的四个字段

| 字段 | 含义 |
|------|------|
| Current State | 此刻项目处于什么状态：完成了什么、正在做什么、阻塞在什么上 |
| Decisions Made | 本轮做了哪些决策，每条包含选项 → 选择 → 为什么 → 放弃了什么 |
| Context for Next Thread | 下一个 thread 必须知道的背景，不写就需要重新解释的东西 |
| Immediate Next Steps | 下个 thread 打开后第一件要做的事，按优先级排列 |

### 跨层 handoff 流转

当 L2 thread 结束时，新开的下一个 L2 thread 需引用两样东西：
1. 上一个 L2 的 handoff——了解历史决策和状态
2. 自己的 scope.md——知道本次边界和终止条件

L1 负责从 L2 的 handoff 中提取信息，产出 next L2 的 scope。

## Rationale（用户直接阐述的思考）

[用户]：handoff 不需要多余信息——四个必须字段足矣。命名要带上层级，因为同一个日期可能有多个层的 thread 同时运行。每个层级同一时间只维护一个 thread，所以同层不会有两个并行的 handoff。

## Alternatives Considered

- **handoff 和 decisions 分开放**：产出物割裂，想找"这个 thread 产出了什么"需要跨两个目录。放弃。
- **工业界的自动脚手架脚本**：调研了 softaworks/agent-toolkit 的 session-handoff skill——它自动生成 timestamp、git status、modified files 等元数据。对于个人手动管理项目来说过度工程了。放弃。
- **只写日期不写主题**：不可检索，三个月后不知道这个 thread 讨论了什么。放弃。
- **时分秒精度**：YYY-MM-DD-HHMMSS 太长，个人开发一天只开一个 thread 即可。放弃。

## AI Role

[AI]：调研了 softaworks、davila7、Matt Pocock 的 handoff 标准，提取了必须字段的业界共识（Current State / Context / Next Steps / Decisions）。设计了命名格式。

## Consequences

- ✅ 交接格式统一，AI 和用户都清楚预期
- ✅ 同目录下 scope + handoff + ADR 全部可追溯
- ⚠️ 跨层流转依赖 L1 主动执行，如 L1 线程未及时响应会导致流转卡住
