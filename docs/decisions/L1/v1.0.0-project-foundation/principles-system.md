## ADR / L1 / project-foundation / 工程原则体系

**状态**: accepted
**日期**: 2026-07-06
**来源 thread**: project-foundation

## Context

项目从"探索期"进入了"有方法的建设期"。用户是高中生，边学边做——这个项目本身就是工程实践的学习载体。需要一个原则体系来引导 AI 和用户在做技术决策时保持一致的方向感，同时原则本身也要能跟着学习过程演进。

## Decision

### 原则存放与格式

- 存放位置：`docs/principles/`
- 每条原则一个 `.md` 文件，中文命名，中文解释
- 内容包含：原则陈述 + 来源标注
- 当前 20 条，覆盖设计原则、代码纪律、开发节奏、思维层面、AI 协作五大领域
- 具体清单见 `docs/principles/` 目录

### 原则可演进

原则不是一次封存的教条。本项目是边实践边学习的工程实践——原则随着你在项目中学到新东西而生长。

| 场景 | 规则 |
|------|------|
| 用户或 AI 在开发中发现了新的通用原则 | 新建一个 `principles/*.md` 文件 |
| 某条原则在当前场景不适用 | AI 需要说明理由，但不删除原则——原则是启发性的，不是铁律 |
| 用户提出修正某条原则的表述 | 直接修改该 `.md` 文件，不用走 ADR 流程 |

### AGENTS.md 与 principles/ 的关系

AGENTS.md 必须包含一条核心规则：**AI 在每次设计或写代码前，应主动对照 `docs/principles/` 检查自己是否偏离原则。如果本项目的原则与你的行为有冲突，说明理由，优先遵守原则。** AGENTS.md 中通过引用 ADR-5 来指向本决策。

### 与 genesis/ 的区别

- `genesis/` = 项目灵魂（Xenica 为什么存在）——你手写，AI 只读，不可变
- `principles/` = 通用工程指南（怎么做好工程）——可演进，适用任何项目
- `decisions/` = 本项目特定技术决策（为什么选 PostgreSQL 而不是 Neo4j）

三者各不重叠：genesis 是 why this project，principles 是 how to engineer，decisions 是 what we chose。

## Rationale（用户直接阐述的思考）

[用户]：这个项目是工程实践——边学边做。原则也一样——不是一开始就写死 20 条，而是在讨论中一条条发现的。以后还会遇到新的场景、新的教训，随时可以往里面加。但是，AI 在设计的时候必须主动参照这些原则，只有不适用时才说明理由偏离。

## Alternatives Considered

- **原则写入 AGENTS.md**：AGENTS.md 已经承载了规则、工作流、目录索引——再加 20 条原则会变为上千行难以维护。放弃。改由 AGENTS.md 通过一行引用指向 principles/ 目录。
- **原则作为 xenica-genesis 的一部分**：genesis 是项目灵魂——它不可变、不添加。但原则是活的，需要演进。放在 genesis 下会违背其只读特性。放弃。

## AI Role

[AI]：调研了 Unix 哲学 17 条、人月神话（Brooks）、程序员修炼之道（Hunt & Thomas）、Code Complete（McConnell）、Anthropic 的 Context Engineering 四策略、Thariq 的地图/领土框架。从这些源头提取了可复用的通用原则，与用户逐步确认后形成了 20 条清单。

## Consequences

- ✅ AI 有明确的参考体系，不会因"不知道项目怎么想的"而偏离方向
- ✅ 原则是活的，随着学习过程自然增长
- ⚠️ 20 条是否太多——后续在 L2/L3 的实际开发中检验哪些真正高频被引用
- ⚠️ AGENTS.md 必须及时更新原则索引——否则 AI 读不到新原则
