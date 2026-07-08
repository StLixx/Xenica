## ADR / L1 / project-foundation / 开发工作流——人+AI 动作体系

**状态**: accepted
**日期**: 2026-07-06
**来源 thread**: project-foundation

## Context

目前的 ADR 定义了分层体系、handoff 格式、目录结构、ADR 标准、原则体系——但这些都是"实体"：定义了哪些东西存在、它们长什么样。缺一个视角：**人和 AI 在每个阶段做什么动作**。从哪里开始？怎么切换？怎么保持焦点？什么时候提交？

## Decision

### 整体循环

```
┌──────────────────────────────────────────────────┐
│  1. 从 scope 开始                                  │
│     打开一个 thread → 写 scope.md → 确定边界       │
│                     ↓                             │
│  2. 聚焦讨论                                      │
│     thread 内只讨论 scope 范围内的事                │
│     超出范围的内容 → 记录下来但不展开               │
│                     ↓                             │
│  3. 产出 ADR + handoff                            │
│     thread 结束时：                                │
│     - 已确认的决策 → 写成 ADR（what + why + avoided）│
│     - 未确认的 → 写进 handoff 留给下一个 thread      │
│                     ↓                             │
│  4. 提交变更                                      │
│     一个完整的 thread 结束 → 一次 commit            │
│     commit message = thread 一句话总结              │
│                     ↓                             │
│  5. 下一个 thread 从这里读 handoff 开始              │
└──────────────────────────────────────────────────┘
```

### 分段详解

#### 1. 从 scope 开始

每个新 thread 的第一个文件是 `scope.md`。它定义：
- 这个 thread 要达成什么目标
- 范围内——哪些话题属于本 thread
- 范围外——哪些话题碰到了但故意不讨论（交给别的 thread）
- 终止条件——什么时候这个 thread 算结束

scope.md 的内容来自：
- 同级上一个 thread 的 handoff（了解历史）
- 上级 thread 的指示（L2 的 scope 由 L1 指定）

#### 2. 聚焦讨论

thread 运行中只讨论 scope 范围内的事。如果讨论中冒出 scope 外的话题（例如 L2 讨论设计时想"这个函数怎么写"），做法是：
- 记下来，不展开
- 写进 handoff 的 Next Steps 或单独一个 `out-of-scope-notes.md`
- 由上级 thread（L1）或同级的下一 thread 决定要不要纳入 scope

这就是"焦点管理"——每个 thread 有明确的责任边界，不被相邻层级的噪音干扰。

#### 3. 产出 ADR + handoff

thread 结束时做三件事：
- **已确认的决策** → 写成 ADR，放进 `decisions/[层级]/[thread名]/`
- **讨论了但未确认的** → 写进 handoff 的 Decisions Made 区域，标注状态（proposed / need-review）
- **handoff** → 四个必须字段

手头没有足够信息判断的决策不硬写 ADR。标注"待 L2 确认"或"待调研"够诚实。

#### 4. 提交变更（Git）

**什么时候 commit**：一个 thread 结束 = 一次 commit。不在 thread 中间做零碎的 commit——thread 是一个连贯的工作单元，commit 也应该是一个连贯的交付物。

**commit message 格式**：`[层级] [主题]：[一句话做了什么]`

例如：`L1 project-foundation: 建立分层管理体系、文档目录、ADR 标准和原则体系`

**什么时候 push**：每次 commit 后 push 到 GitHub。保持远端同步，防止本地硬盘挂了。

#### 5. 进度管理

进度不由看板工具管理，而是由 decisions/ 的目录树自然表达：
- 打开 `decisions/L1/` → 看到几个 thread 文件夹 = L1 做了几轮工作
- 打开一个 thread 文件夹 → 看到 `scope.md` + ADR + handoff = 这轮做了什么
- 打开 handoff → 看到 Next Steps → 未完成的在这里

没有额外状态追踪文件——`scope.md` 的终止条件就是 checklist，handoff 的 Next Steps 就是 backlog。

#### 6. 未来 CICD 集成点

当前无需 CICD。当项目有可运行的代码后，CICD 挂载点：
- GitHub Actions 在每次 push 后触发 `cargo check` + `cargo test`
- 如果测试不通过 → 阻止合并
- 如果测试通过 → 自动 deploy 文档站点（`about/` 下的内容）

这个决策不在本 thread 实现，仅标记未来方向。

## Rationale（用户直接阐述的思考）

[用户]：已有的 ADR 都在定义"什么东西应该存在"——分层、handoff、目录。但缺的是"我和 AI 到底怎么做"——从哪开始、怎么判断做完了、什么时候 commit。这些动作规范一旦定下来，以后所有 L2/L3 thread 就能像流水线一样运转：开 scope → 讨论 → 产出 ADR → handoff → commit → push → 下一个。

另一个驱动：Git 提交节奏。不想在 thread 中间做零碎提交，因为中间态的东西可能还没确认就被 push 了。一个 thread 一个 commit——干净，可追溯。

## Alternatives Considered

- **每次改动单独 commit**：commit 历史碎片化，难以回溯"thread X 产出了哪些变更"。放弃。
- **不写 scope.md 直接开始讨论**：缺乏明确边界，容易跑题。上一个探索 thread 的问题之一。放弃。
- **独立进度文档 tracking.md**：增加维护负担，且 decisions 目录树本身已经表达了进度。放弃。

## AI Role

[AI]：从本 thread 的实际运作中提取了动作模式——scope → 讨论 → 产出 → handoff → commit。将用户的"一次 thread 一次 commit"偏好形式化为 Git 规范。标记了未来 CICD 的挂载点。

## Consequences

- ✅ 以后所有 L2/L3 thread 有明确的操作指南
- ✅ commit 历史干净——一个 thread 一次 commit，可追溯到 scope.md
- ✅ 进度由目录树直接可见
- ⚠️ scope 范围外的话题需要 discipline 来记录而不展开——需要 AI 和用户共同克制
- ⚠️ CICD 只是标记，尚未实现
