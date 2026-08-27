## ADR / L1 / project-foundation / ADR 书写标准

**状态**: accepted
**日期**: 2026-07-06
**来源 thread**: project-foundation

## Context

项目需要一个标准化的决策记录格式。调研发现业界有三种主流模板：Nygard ADR（极简五段）、MADR 4.0（完整带选项对比）、Y-Statement（一句话）。它们都缺一个关键维度——没有区分用户思考和 AI 辅助。在 AI 协作项目中，"谁说了什么"是判断决策可信度的核心信息。

## Decision

### 必要字段

| 必须 | 字段 | 说明 |
|:--:|------|------|
| ✅ | 编号 + 标题 | 放入文件内容第一行 `##` 元数据 |
| ✅ | 状态 | proposed / accepted / deprecated / superseded |
| ✅ | 日期 | 决策日期 |
| ✅ | Context | 面临什么问题、为什么需要这个决策 |
| ✅ | Decision | 选了什么方案 |
| ✅ | **Rationale（用户直接阐述的思考）** | 用户的判断逻辑。**必须标注 [用户]** |
| ✅ | Alternatives Considered | 考虑过的替代方案及放弃原因 |
| ✅ | **AI Role（AI 在本决策中的贡献）** | AI 做了什么分析、提供了什么信息。**必须标注 [AI]** |
| ✅ | Consequences | 正面 + 负面后续影响 |

### 非必要字段（MADR 有但本项目不强制）

- Decision Drivers（用户没提就不填）
- Deciders 名单（只有一个人）
- Confirmation（如何验证决策生效——个人项目不需要）

### 文件内容三段式结构

每个 ADR 的 Decision 部分必须包含三个层次：

1. **做了什么（what）**——具体选了什么方案、怎么实现
2. **为什么这样做（why）**——背后的设计思路，我是怎么想的
3. **避开了什么 / 弃用了什么（what was avoided）**——如果有的话。不是每个决策都有，但有的话必须写。这是为了防止未来的人（或 AI）重新走上已经否决过的路

### 命名规则

文件名：`[主题].md`，简短。例如 `thread-layers.md`。不把元数据塞进文件名。
元数据：放在文件内容第一行，格式 `## ADR / [层级] / [thread名] / [决策标题]`

### 状态流转

```
proposed → accepted → deprecated → superseded by [新ADR]
```

accepted 后不可修改。如需推翻，新开一个 ADR 并 supersede 旧的。

## Rationale（用户直接阐述的思考）

[用户]：ADR 必须分清楚哪些是我说的、哪些是 AI 补充的。这样过几个月回来看的时候，能立刻判断"这个决策是基于我当时对什么的理解做出的"。三段式（what/why/avoided）也是这个目的——光写"选了 A"不够，需要知道为什么选 A 而不是 B，以及 B 为什么不行。

另一个动机：希望未来的 AI thread 读这些 ADR 后，需要我纠正的情况越来越少。如果每个 ADR 都自带了完整的上下文和理由，AI 就不会重复问"为什么不试试 X 方案"。

## Alternatives Considered

- **MADR 4.0 full template**：太完整，包括 Decision Drivers、Confirmation 等字段。对个人项目过度，且缺少 AI Role 维度。取用其 Context/Decision/Consequences 骨架，大幅精简。
- **Y-Statement**：太极简，一句话装不下设计推导过程。放弃。
- **元数据放文件名**：样例 `L1-project-foundation-2026-07-06-thread-layers.md` 太长不可读。放弃。元数据放文件内 `##` 行。

## AI Role

[AI]：调研了 Nygard ADR、MADR 4.0 的 full 和 minimal template、Y-Statement 三种业界格式。提取了它们的共同骨架（Context/Decision/Consequences）。新增了 Rationale（用户思考）和 AI Role（AI 贡献）两个字段以适配 AI 协作场景。设计了状态流转规则。

## Consequences

- ✅ ADR 可追溯：知道是谁做的判断、基于什么信息
- ✅ 未来 AI thread 能通过阅读 ADR 理解上下文，减少重复提问
- ⚠️ 写 ADR 的成本比简单记录"选了 A"略高——但投资回报比远大于成本
- ⚠️ AI Role 字段需要 AI 诚实判断自己的贡献边界——它不能夸大也不能隐瞒
