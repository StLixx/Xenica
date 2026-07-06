## ADR / L1 / project-foundation / docs/ 目录结构

**状态**: accepted
**日期**: 2026-07-06
**来源 thread**: project-foundation

## Context

项目初始阶段，docs/ 下目录混乱：
- AI 生成的架构文档和用户手动写的反思混在 `exploration-versions/`
- 交接文档放在 `AI-sessions/`，命名和结构没有标准
- 缺少面向协作者的入口文档（`about/` 为空）
- 需要支持"仓库从私有变公开时一键隐藏个人开发过程"

## Decision

### 6 个顶层文件夹

```
docs/
├── about/              ← 标准项目文档（公开，AI 可写）
├── genesis/            🔒 灵魂文件（公开，用户手写，AI 只读）
├── decisions/          ← ADR 决策卡（公开，AI + 用户）
│   ├── L1/             ← L1 层所有 thread 的决策
│   │   └── project-foundation/  ← 本 thread
│   ├── L2/             ← L2 层
│   └── L3/             ← L3 层
├── principles/         ← 工程原则（公开，可演进）
├── inbox/              ← 无归属的片段（私有，有空再提炼）
└── archive/            ← 历史方案归档（可选公开）
```

### 公开/私有分离

| 文件夹 | 迁移到公开仓库？ | 谁写 |
|--------|:--:|------|
| about/ | ✅ | AI 可写 |
| genesis/ | ✅ | 🔒 只有用户 |
| decisions/ | ✅ | AI + 用户 |
| principles/ | ✅ | AI + 用户 |
| inbox/ | ❌ 隐藏 | AI + 用户 |
| archive/ | ⚠️ 可选 | 冻结 |

### decisions/ 按 L 层级 → thread 名组织

不再用扁平编号。每个 thread 一个子文件夹，例 `decisions/L1/project-foundation/`。
文件夹内含：`scope.md`（thread 目标/范围/终止条件）、handoff、所有 ADR。打开一个文件夹，这个 thread 的全部内容一览无余。

### 历史

workshop 最初名为 "workshop/"，后被重命名为 "inbox/"——因为"workshop"容易和 decisions 的概念重叠（workshop 里放着讨论产生的设计文档，它们其实就是决策草案）。改名后，inbox 只放无归属的片段（如调研笔记），与 decisions 的职责彻底分离。

## Rationale（用户直接阐述的思考）

[用户]：想把 docs 分成两类——标准化的（协作者来了先看这些）和个人的（自己的开发过程、调研笔记）。如果以后把仓库公开或邀请协作者，inbox/ 直接隐藏即可。另一个动机是让目录结构能体现出 L1-L3 的分层——打开 decisions/ 就能看到各层产出了什么。

## Alternatives Considered

- **所有文件扁平编号**：看不出决策来自哪个 thread、哪个层级。放弃。
- **workshop 保留原名**：名字暗示"这里是干活的地方"，但 ADR 和设计文档也是干活的地方——概念重叠。改名为 inbox 后语义清晰：inbox 是无归属的暂存区，decisions 是已确认的决策。放弃原名。
- **access 权限单独成一个 ADR**：访问权限是目录结构的附带属性，不是独立决策。合并到本文档。

## AI Role

[AI]：调研了 GitHub 官方推荐（README/CONTRIBUTING/SECURITY）、Folder-Structure-Conventions 仓库、Diataxis 文档框架。设计了 6 顶层结构并论证了命名方案。

## Consequences

- ✅ 仓库公开时一键隐藏 inbox/
- ✅ 新协作者能通过 about/ 快速了解项目
- ✅ decisions/ 目录树直接反映层级体系
- ⚠️ inbox/ 内容如果不定期清理会堆积——需要在 AGENTS.md 中注明清理规则
