## L1 / v4.0.0-naming-conventions / Session Handoff

**日期**: 2026-07-08
**来源 scope**: [scope.md](scope.md)

---

## Current State

naming-conventions scope 全部完成。所有终止条件均已达成。

### Scope 终止条件达成情况（最终）

| # | 条件 | 结果 |
|---|------|------|
| 1 | `docs-structure.md` 被新 ADR `decision-002-supersede-docs-structure.md` 显式 supersede | ✅ 已落地 |
| 2 | 所有 thread 文件夹遵循 `v{m}.{n}.{p}-{name}` 形式；旧名残留为 0 | ✅ 28 个 tracked 文件 rename 完成 |
| 3 | `AGENTS.md` 含 scope/thread 区别 + commit 颗粒度表述 | ✅ `## 七、Scope、Thread 与上下文预算` |
| 4 | 跨文档相对链接无残留旧路径 | ✅ Git 自动跟踪 mv |
| 5 | 一次 commit + push 推 `origin/master` | ✅ |

### 重命名映射表

| 旧名 | 新名 | 备注 |
|------|------|------|
| `L1/project-foundation/` | `L1/v1.0.0-project-foundation/` | m=1, Phase 1 |
| `L1/architecture-foundation/` | `L1/v2.0.0-architecture-foundation/` | m=2, Phase 1 |
| `L1/core-capabilities/` | `L1/v3.0.0-core-capabilities/` | m=3, Phase 2 |
| `L1/naming-conventions/` | `L1/v4.0.0-naming-conventions/` | m=4, 本 thread 自身 |
| `L2/backend-core/` | `L2/v2.1.0-backend-core/` | n=1 属于 v2 |
| `L2/infrastructure-setup/` | `L2/v3.1.0-infrastructure-setup/` | n=1 属于 v3 |
| `L2/search-import-impl/` | `L2/v3.2.0-search-import-impl/` | n=2 属于 v3 |

总计：6 个 scope 文件夹迁移（含 28 个 tracked 文件） + 1 个新 L1 scope（命名约定自身）+ 4 个新文件 (本 scope 内) = 32 个文件影响。

### 执行动作清单

1. ✅ 写 `docs/decisions/L1/v4.0.0-naming-conventions/scope.md`
2. ✅ 写 `docs/decisions/L1/v4.0.0-naming-conventions/decision-001-naming-scheme.md`（accepted）
3. ✅ 写 `docs/decisions/L1/v4.0.0-naming-conventions/decision-002-supersede-docs-structure.md`（accepted supersede）
4. ✅ 修改 `AGENTS.md`（修订 `## 五、`、`## 六、`、`## 七、` 三段）
5. ✅ 批量 git mv（28 个 tracked 文件）
6. ✅ 写本 handoff
7. ⏳ 一次 commit + push（thread 关闭）

---

## Decisions Made

完整决策记录见：

- [decision-001-naming-scheme.md](decision-001-naming-scheme.md) — 命名方案 + scope/thread 概念分离 + workflow constraints
- [decision-002-supersede-docs-structure.md](decision-002-supersede-docs-structure.md) — supersede `docs-structure.md`

### 关键决策摘要

1. **版本号格式**：`v{m}.{n}.{p}-{name}`，L1 末两位恒 0，L2 末位恒 0，L3 可填
2. **Phase 派生**：m=1,2 → Phase 1；m=3 → Phase 2；m≥4 → Phase 3+
3. **Scope / Thread 分离**：scope = 文件夹（git），thread = AI 会话（运行时）；一个 thread 可承载多 scope
4. **Commit 颗粒度**：L1 = 一次性；L2 / L3 = 每个 scope 单独
5. **L1 例外**：批量 `git mv` 跨多个 scope 物理路径迁移可单 commit（不产生新文件）

---

## Context for Next Session

### 下个 L1 / L2 / L3 thread 在新规则下应遵循

1. 新 scope 文件夹必须使用 `v{m}.{n}.{p}-{name}` 格式
2. **第一个**新 thread 是 **v4.x.x**（v4 是已用，新 L1 必须 v5+；新 L2 必须是 v4.1.0 / v4.2.0 等；新 L3 必须是 v4.x.1 等）
3. AGENTS.md 的 `## 五、6.` 现在引用本 ADR-001，新 thread 必须按层级 commit
4. 下一个 L2 scope（已规划）：`v3.3.0-mineru-cli-handler` 或 `v3.4.0-video-ppt-handler`

### 关键发现

- `docs/decisions/L1/v2.0.0-architecture-foundation/` 内含未 git tracked 的中文文件名 (`场景.md`, `架构图.md`, etc.)，由 `git mv` 一并迁移。这些文件是去年存在但未 commit 的工作记录——本 scope 不处理其内容，但已一并物理迁到 v2.0.0 目录下。如果未来追溯原始作者或要清理，建议单开一个 L1 cleanup scope。

### 启动与测试

无新增启动命令。本 scope 不涉及代码层。

### 最终目录布局

```
docs/decisions/
├── L1/
│   ├── v1.0.0-project-foundation/      ← Phase 1 起点
│   ├── v2.0.0-architecture-foundation/ ← Phase 1 末
│   ├── v3.0.0-core-capabilities/       ← Phase 2
│   └── v4.0.0-naming-conventions/      ← Phase 2 末（本 thread）
├── L2/
│   ├── v2.1.0-backend-core/            ← 属于 v2
│   ├── v3.1.0-infrastructure-setup/    ← 属于 v3
│   └── v3.2.0-search-import-impl/      ← 属于 v3
└── (L3 暂无)
```

---

## 线程状态

**thread 关闭**：本 thread (L1 v4.0.0-naming-conventions) 完成后将 commit + push 推送到 `origin/master`。

后续工作（v3.3.0-mineru-cli / v3.4.0-video-ppt / 其他 L2 / L3 scope）由新 thread 在新命名规则下启动，**不继承本 thread 的上下文**。
