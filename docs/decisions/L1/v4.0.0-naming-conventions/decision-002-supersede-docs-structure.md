# ADR-002: Supersede docs-structure.md — folder naming rules now covered by ADR-001

**Status**: accepted
**Date**: 2026-07-08
**Supersedes**: `docs/decisions/L1/v1.0.0-project-foundation/docs-structure.md`
**Superseded by**: —

---

## What

本 ADR 显式声明对原 `docs/decisions/L1/v1.0.0-project-foundation/docs-structure.md` (accepted) 的 supersede 关系，并补充"具体子文件夹命名规则"段。

### 子文件夹命名规则（覆盖原 docs-structure）

`docs/decisions/{L1,L2,L3}/` 下每一个 scope 文件夹必须采用 ADR-001 规定的语义化版本号前缀：

```
v{m}.{n}.{p}-{name}
```

| 层级 | 命名形式 | 第三段规则 |
|------|---------|----------|
| L1 scope | `v{m}.0.0-{name}` | 第三段恒为 0 |
| L2 scope | `v{m}.{n}.0-{name}` | 第三段恒为 0 |
| L3 scope | `v{m}.{n}.{p}-{name}` | 第三段可填任意非零自然数 |

字段语义：

- `m` = L1 thread 时间线序号（1, 2, 3, ...）
- `n` = L2 thread 在所属 L1 内的序号（1, 2, 3, ...）
- `p` = L3 thread 在所属 L2 内的序号（1, 2, 3, ...）

### 命名示例（mapping）

| 旧名 | 新名 |
|------|------|
| `L1/project-foundation` | `L1/v1.0.0-project-foundation` |
| `L1/architecture-foundation` | `L1/v2.0.0-architecture-foundation` |
| `L1/core-capabilities` | `L1/v3.0.0-core-capabilities` |
| `L2/backend-core` | `L2/v2.1.0-backend-core` |
| `L2/infrastructure-setup` | `L2/v3.1.0-infrastructure-setup` |
| `L2/search-import-impl` | `L2/v3.2.0-search-import-impl` |

### Phase 边界派生

- m = 1, 2 → Phase 1
- m = 3 → Phase 2
- m ≥ 4 → Phase 3+

具体映射由历史 handoff 决定（已在 `v2.0.0-architecture-foundation` 的 handoff 中提及 Phase 1 范围，即 data-model + api-design）。

---

## Why

### Why 1. 为什么 supersede 而不是修改原 ADR

AGENTS.md 第 1 章明确规定：

> `docs/decisions/` 下状态为 `accepted` 的 ADR 不可修改。如需推翻，新开 ADR 标注 `supersedes`。

`docs-structure.md` 仍然存在（不被删除），但其"目录布局"部分的具体子文件夹命名规则已被替代。通过 supersede 关系保留历史可追溯性。

### Why 2. 为什么命名规则放在本 ADR 而不是还原回 docs-structure

- 命名规则与 ADR-001 的 scope/thread 概念分离、workflow constraints 是同一个决策单元
- 三者必须协同落地；任何一条独立修改都破坏一致性
- 把命名规则放在 supersede ADR 中显式声明"具体子文件夹命名规则"段，是 supersede 关系的最小必要补充

---

## Avoided

### 不直接修改 docs-structure.md

- 直接修改违反 AGENTS.md 第 1 章原则
- 同时 git history 失去"原本的目录布局约定 → 命名规则补充"的演进轨迹

### 不删 docs-structure.md

- 历史 ADR 即使 superseded 也保留可读性
- 删除会破坏 L1 thread 的 handoff 中对原 ADR 的引用

### 不在 docs-structure.md 上 append "见 ADR-001"

- 同样违反"accepted 不可修改"
- supersede 关系在新 ADR 中显式标注，更清晰
