# ADR-001: Naming scheme — versioning thread folders with semver-like prefix

**Status**: accepted
**Date**: 2026-07-08
**Supersedes**: —
**Superseded by**: —

---

## What

本 ADR 一次性确立两件事：

### 1. Scope 文件夹命名方案（versioning）

`docs/decisions/{L1,L2,L3}/` 下的每一个 **scope 文件夹**必须使用语义化版本号前缀：

```
v{m}.{n}.{p}-{name}
```

| 层级 | 字段 | 第三段 `p` | 形式 | 示例 |
|------|------|----------|------|------|
| L1 | m.0.0 | **始终为 0** | 三段，主导版本号 | `v1.0.0-project-foundation`、`v2.0.0-architecture-foundation`、`v3.0.0-core-capabilities`、`v4.0.0-naming-conventions` |
| L2 | m.n.0 | **始终为 0** | 第二段区分所属 L1 内的 L2 顺序 | `v2.1.0-backend-core`、`v3.1.0-infrastructure-setup`、`v3.2.0-search-import-impl` |
| L3 | m.n.p | **可填** | 第三段区分所属 L2 内的 L3 顺序 | （未来）`v3.2.1-some-impl-detail` |

#### 各字段语义

- **第一段 `m`**：L1 thread 在时间线上的序号。Phase 边界是**派生量**——若 L1 m=1、2 同属 Phase 1，m=3 起就是 Phase 2；具体哪一段 L1 属于哪个 Phase 由历史 handoff 决定。
- **第二段 `n`**：L2 thread 在所属 L1 内的顺序。`v2.1.0-backend-core` 意味着它是 architecture-foundation (`v2.0.0`) 的第一个 L2。
- **第三段 `p`**：L3 thread 在所属 L2 内的顺序。`v3.2.1-...` 意味着它是 `search-import-impl` 的第一个 L3 实现点。

### 2. Scope / Thread 概念分离

**Scope** 与 **Thread** 是两个正交概念，必须显式区分：

| 维度 | Scope | Thread |
|------|-------|--------|
| 物理体现 | `docs/decisions/{level}/v{m}.{n}.{p}-{name}/` 文件夹 | AI 会话上下文（用户启用的一个 agent session） |
| 数量持久化 | 一项目 N 个 scope，全在 git 里 | 运行时存在，会话关闭即消失 |
| 生命周期 | 从 scope.md 写起到 scope 的 ADR 全部 accepted | 从用户启动 AI 起到用户关闭 AI 止 |
| commit 颗粒度 | 详见 "Workflow constraints" 节 | thread 关闭时一次性 commit + push |

### 3. Workflow constraints

| 层级 | scope 是工作组 | git commit 颗粒度 | git push 颗粒度 |
|------|---------|---------------|---------------|
| **L1** | 元基础设施（决策体系、目录结构、AGENTS.md、版本号） | **一个 L1 scope = 一次性 commit**（含 mv / 新 ADR / 修改老 ADR / AGENTS.md / 引用修复） | L1 scope close 时一次性 push |
| **L2** | 模块架构（具体模块的代码实现） | **每个 L2 scope 单独 commit + 单独 push** | 每个 L2 scope 都 push |
| **L3** | 代码实现细节（一个文件内 / 一个函数内） | **每个 L3 scope 单独 commit + 单独 push** | 每个 L3 scope 都 push |

**Thread / scope 关系**：一个 thread 可以承载多个 scope（L1 / L2 / L3 自由组合），**不强制一 thread = 一 scope**。Open-closed 原则：开新 thread 是为了独立上下文与缓存命中，但只要当前 thread 上下文健康（< 80%）就可以继续写下一个 scope。

**L1 例外说明**：批量 `git mv`（跨多个 scope 的物理路径迁移）可作为一个 commit 落地，但不产生新文件——因此不算作"独立 scope 工作"。git log 中展示为单一 commit 是合理的。

---

## Why

### Why 1. 为什么引入版本号文件夹前缀

- **目录树升序即时间线**：浏览器、IDE、命令行 `ls` 排序直接给出阅读顺序，不必逐文件点开看 `Date:` 字段
- **父子关系内嵌**：`v2.1.0-backend-core` 的数字相邻（同 m 段、同 n 段）立刻表达"它属于 v2.0.0"
- **未来 L3 出现时规则不变**：把第三段填上就行，命名方案向前兼容
- **Phase 边界不强行写进字段**：避免每次 Phase 调整都触发重命名；Phase 是 m 派生的副产品

### Why 2. 为什么显式分离 scope / thread

- 现行 AGENTS.md 隐含假设"thread = scope"，导致每次开新 scope 都强制开新 thread，触发完整上下文重读
- 新一代 AI 模型普遍达到 1M token 上下文；上下文预算不再是强约束
- 缓存命中考虑：相同 thread 内连续推进新 scope，文件已在缓存中；开新 thread 则需重新索引整个仓库
- 这是工作流而非权限：多 scope 在同 thread 内不破坏 L1 / L2 / L3 的关注点分离；open-closed 原则确保 AI 仍能聚焦当前 scope 的 target

### Why 3. 为什么 supersede docs-structure ADR

- `docs-structure.md` (accepted) 含目录布局但缺具体子文件夹命名规则
- 现状被本 ADR 改变——不修改老 ADR 而是显式 supersede 是 AGENTS.md 第 1 章"已 accepted 不可修改"原则的执行

---

## Avoided

### 不采用：单纯数字前缀（如 `001-...`、`002-...`）

- 优点：简单
- 缺点：跨级比较看不出 L2 属于哪个 L1；数字等于全局时间序但失去层级语义

### 不采用：`X.Y.Z` 全局时间序

- 优点：纯全局升序
- 缺点：失去 L1 / L2 / L3 层级语义；父子关系靠 metadata 维护，需 grep 才知道父子

### 不采用：保留"一 thread = 一 scope"假设

- 维持现行 AGENTS.md 隐含习惯
- 缺点：上下文重读成本高；新模型上下文预算富余时这一习惯成了纯浪费

### 不采用：把规则拆成多份独立 ADR

- 优点：每条独立小决策
- 缺点：版本号 + scope/thread + workflow constraints 三者必须协同落地，单独修改任一条会破坏其他两条的一致性。本 ADR 显式声明三者属于一个决策单元

### 不引入：把 Phase 写进文件夹名

- 形式：`v1-phase2-...` 之类
- 缺点：Phase 调整触发重命名；m 段已经派生 Phase 信息，不需要冗余
