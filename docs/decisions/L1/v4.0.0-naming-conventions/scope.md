# L1 / naming-conventions

**Phase**: Phase 2 末段（前置改造，为段 B 子项目铺路，同时固化文档体系自身的工作流原则）

**Thread type**: L1 / project-foundation 系列的延续（覆盖 workflow、docs-structure、adr-standard 等顶级规范）

**归属性**: 自身是 L1 scope（v4.0.0 — 本 thread 是第四个 L1）。

---

## 目标

本 scope 解决三个相互关联的问题，三者必须协同落地，不能拆分到三个 scope：

1. **目录结构无法表达时间线**：当前 `decisions/L1/`、`L2/` 下的文件夹是按主题命名，无版本号化字段。新加入者无法从目录树本身看出"哪一个是最早、哪一个接它、哪一个属于上一个 L1 的子层级"。
2. **scope 与 thread 在现行文档中隐含地混淆**：AGENTS.md `## 五、开始一个 Thread` 段未区分"scope = 文件夹"与"thread = AI 会话上下文"，造成隐含假设"一个 thread 完成一个 scope"。这导致每次开新 scope 都强制开新 thread，触发完整上下文重读，浪费缓存命中。新模型普遍达到 1M token 上下文，上下文预算不再是强约束，多 scope 在同 thread 中可提升效率。
3. **AGENTS.md 与 docs-structure ADR 与现状不协同**：AGENTS.md 引用的子文件夹路径`docs/decisions/L1/v1.0.0-project-foundation/session-handoff.md`等是具体的子文件夹名；当前没有任何 ADR 在 `accepted` 状态里规定"新加 scope 必须遵循的命名约定"。docs-structure ADR 重命名后会过期。

本 scope 完成后：

- `decisions/*` 下所有 thread 文件夹全部带版本号前缀，文件树升序即时间线
- AGENTS.md 加一节专门说明 scope/thread 区别，并加入"一个 thread 可承载多 scope"的工作流约定
- `docs-structure.md` (accepted) 被新 ADR (supersede) 覆盖，含"具体子文件夹命名规则"段

---

## 范围 (in scope)

- 新文件落地于 `docs/decisions/L1/v4.0.0-naming-conventions/`：
  - 本 `scope.md`
  - `decision-001-naming-scheme.md` —— 版本号命名方案 + scope / thread 概念分离（What / Why / Avoided 三段式）
  - `decision-002-supersede-docs-structure.md` —— 声明 supersede 关系
  - `naming-conventions-2026-07-08-handoff.md` —— 执行动作的 manifest
- 批量 `git mv` 重命名：
  - `L{level}/{name}/` → `L{level}/v{m}.{n}.{p}-{name}/`
  - 覆盖所有现有 thread 文件夹
- 同步所有跨文档相对链接（`../`、`./` 引用）（grep + sed / 手写修正）
- 更新 `AGENTS.md`：
  - 把 `## 七、上下文预算` 段扩展为 `## 七、Scope、Thread 与上下文预算`，包含 scope/thread 区别表
  - 修订 `## 五、开始一个 Thread` 段第 6 条为引用 ADR-001 的 commit / push 颗粒度
  - 修订 `## 六、交接与进度` 反映新命名约定

---

## 不在范围内 (out of scope)

- **不**重新划分 Phase 边界。Phase 1 / Phase 2 的语义边界不变；版本号第一段 `m` 是 L1 序号，"哪个 L1 属于哪个 Phase"由历史 handoff 决定，本 scope 不改这一事实。
- **不**重写 ADR 内容字符。本 scope 只动文件夹名 + 跨文档链接；ADR 内的文字一行不改（除了 `decision-002-supersede-docs-structure.md` 显式声明覆盖关系）。
- **不**发起任何代码层动作（MinerU / 视频 CLI）—— 那些是 v3.3.x / v3.4.x 范围。
- **不**重新评估 AGENTS.md 第 1-4 章（genesis / decisions baseline / engineering principles / project structure）；本次只修订第 5、6、7 章。
- **不**引入"强约束多 scope"假设。本 scope 只说"一个 thread 可承载多 scope"，不写"必须多 scope"。

---

## 工作流原则（本 scope 显式声明）

L1 / L2 / L3 scope 在 commit 与 push 颗粒度上有天然差异：

| 层级 | 工作组 | git commit 颗粒度 | git push |
|------|--------|------------------|---------|
| **L1** | 元基础设施（决策体系、目录结构、AGENTS.md、版本号） | **一个 L1 scope = 一次性 commit**（含 mv / 新 ADR / 修改老 ADR / AGENTS.md / 引用修复） | L1 scope close 时一次性 push |
| **L2** | 模块架构（具体模块的代码实现） | **一个 L2 scope = 单独 commit + 单独 push** | 每个 L2 scope 都 push |
| **L3** | 代码实现细节（一个文件内 / 一个函数内） | **一个 L3 scope = 单独 commit + 单独 push** | 每个 L3 scope 都 push |

L1 scope 工作组大、跨多文件，是一次性快照；L2 / L3 scope 是独立小工作单元，分开 commit 与 push 更便于追溯。在 ADR `decision-001-naming-scheme.md` 第 "Workflow constraints" 节显式重声明。

---

## 终止条件

| # | 条件 |
|---|------|
| 1 | `docs-structure.md` 被新 ADR `decision-002-supersede-docs-structure.md` 显式 supersede，包含"具体子文件夹命名规则"段；该 ADR 落地于 `decisions/L1/v4.0.0-naming-conventions/` |
| 2 | `docs/decisions/` 下所有 thread 文件夹遵循 `v{m}.{n}.{p}-{name}` 三段版本号；`git ls-files docs/decisions` 中旧名（无版本号前缀）残留为 0 |
| 3 | `AGENTS.md` 包含"scope 与 thread 的区别"小节 + "L1/L2/L3 commit 颗粒度"工作流约束的明文表述 |
| 4 | 所有跨文档相对链接（`../`、`./` 引用）经 `grep -r` 扫描无残留旧路径；git mv 自动跟踪修订 |
| 5 | 一次 commit 包含本 scope 全部产出（4 个新文件 + AGENTS.md 修改 + 批量 mv + 引用修复），一次 push 推 `origin/master`，thread 关闭 |

---

## 关联

- 自我 ADR：`decision-001-naming-scheme.md`、`decision-002-supersede-docs-structure.md`
- 自我 handoff：`naming-conventions-2026-07-08-handoff.md`
- 上游被覆盖 ADR：`docs/decisions/L1/v1.0.0-project-foundation/docs-structure.md`
- 上游保持原状 ADR：`docs/decisions/L1/v1.0.0-project-foundation/workflow.md`、`docs/decisions/L1/v1.0.0-project-foundation/adr-standard.md`、`docs/decisions/L1/v1.0.0-project-foundation/session-handoff.md`、`docs/decisions/L1/v1.0.0-project-foundation/thread-layers.md`
