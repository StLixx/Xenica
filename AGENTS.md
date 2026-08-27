# AGENTS.md

## 一、基准与边界

`docs/genesis/` 划定了这个项目的边界和基调——Xenica 为什么存在、要解决什么问题、以什么理念出发。它是后续所有决策和代码的参考基准。这里的文本由用户手动组织语言，AI 禁止修改——防止在多次 AI 迭代中发生方向漂移。

`docs/decisions/` 下状态为 `accepted` 的 ADR 不可修改。如需推翻，新开 ADR 标注 `supersedes`并在被推翻的老 ADR 中对应段落添加 markdown 删除线和新的 ADR 的引用。

`docs/archive/` 仅供历史参考。

## 二、工程原则

所有设计或代码决策前，先对照 `docs/principles/`。原则不是一次写死的——在开发中遇到新原则时直接新建文件加入。

原则是启发性的：如果某条原则与当前场景冲突，说明理由后可以偏离。`docs/about/project-map.md` 的末尾有原则领域的快速概览。

## 三、项目结构

具体的文件夹结构和每个目录的职责，见 `docs/about/project-map.md`——那是一张只写不可变变量结构的地图。

## 四、分层视角

讨论按 L1→L3 三个层次组织。这不是僵化的权限表，是帮助每个 thread 保持焦点——只处理单一scope的关注点：

L1→L3 是相对关系而非固定关注点——上一层是下一层的父级 scope

不是每个 scope 都需要开 下一层级的 scope。当一个 scope 的子任务复杂度足够高、值得专门跟踪（多文件、跨文档、需要独立 ADR）时，再开子 scope

### Scope vs Thread（必须区分）

| 维度 | Scope | Thread |
|------|-------|--------|
| 物理体现 | `docs/decisions/{level}/v{m}.{n}.{p}-{name}/` 文件夹 | AI 会话上下文（用户启用的一个 agent session） |
| 持久化 | 永久 (git) | 临时 (会话关闭即消失) |
| commit 颗粒度 | 按层级  | thread 关闭时一次性 commit + push |

**关键关系**：一个 thread 可以承载**多个** scope（L1 / L2 / L3 自由组合），不强制"一 thread = 一 scope"。开新 thread 的合理时机：

## 五、开始一个 Scope

打开一个新 scope 时，按照这个流走：

1. **如果没有 scope** → 先讨论 scope，在用户确认写入后，写到 `decisions/[层级]/[thread名]/scope.md`
2. **读 scope**，明确这个 scope 要达成什么、不在范围内的是什么
3. **聚焦讨论**——scope 外的话题记下来放入 handoff 的 Next Steps，不展开
4. **产出**——讨论中确认的决策写成 ADR（`what + why + avoided` 三段式）
5. **结束时产出 handoff**——命名 `[层级]-[主题]-[日期].md`，四个字段：Current State / Decisions Made / Context / Next Steps
   Next Steps不是必须，一般写入本 scope 内提及需要进行且决定不在本 scope 内完成的内容
6. **commit 与 push**——按 scope 层级选择颗粒度
   - Commit 格式：`[v{m}.{n}.{p}] [scope名]：[一句话总结做了什么]`

handoff 的 ADR 在 `docs/decisions/L1/v1.0.0-project-foundation/session-handoff.md`，工作流完整 ADR 在 `docs/decisions/L1/v1.0.0-project-foundation/workflow.md`，命名规则 ADR 在 `docs/decisions/L1/v4.0.0-naming-conventions/decision-001-naming-scheme.md`。

## 六、交接与进度

进度不由看板管理，而是由 decisions/ 的目录树和 handoff 自然表达：

- 打开 `decisions/L1/` → 看到几个 `v{m}.0.0-{name}` 文件夹 = L1 做了几轮工作，文件名升序 = 时间线
- 打开一个 scope 文件夹 → scope.md 说目标、ADR 说决策、handoff 说 next steps
- 通过版本号判定归属：`v2.1.0-backend-core` 数字 `2.x` 与 `v2.0.0-architecture-foundation` 同 m 段 → 即为该 L1 的 L2 子 thread
- 跨层流转：L2 handoff 产出后，L1 读它、讨论、开出下一个 L2 scope
