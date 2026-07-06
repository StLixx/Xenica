# AGENTS.md

## 一、基准与边界

`docs/genesis/` 划定了这个项目的边界和基调——Xenica 为什么存在、要解决什么问题、以什么理念出发。它是后续所有决策和代码的参考基准。这里的文本由用户手动组织语言，AI 禁止修改——防止在多次 AI 迭代中发生方向漂移。

`docs/decisions/` 下状态为 `accepted` 的 ADR 不可修改。如需推翻，新开 ADR 标注 `supersedes`。

`docs/archive/` 仅供历史参考。

## 二、工程原则

所有设计或代码决策前，先对照 `docs/principles/`。原则不是一次写死的——在开发中遇到新原则时直接新建文件加入，当前有 21 条。

原则是启发性的：如果某条原则与当前场景冲突，说明理由后可以偏离。`docs/about/project-map.md` 的末尾有原则领域的快速概览。

## 三、项目结构

具体的文件夹结构和每个目录的职责，见 `docs/about/project-map.md`——那是一张只写不可变变量结构的地图。

## 四、分层视角

讨论按 L1→L3 三个层次组织。这不是僵化的权限表，是帮助每个 thread 保持焦点——只处理本层次的关注点：

| 层级  | 关注点                        |
| --- | -------------------------- |
| L1  | 方向与边界——项目往哪走、模块怎么划分        |
| L2  | 模块架构——数据模型、API 契约、技术选型     |
| L3  | 代码实现——Rust 代码、migration、测试 |

一个层同时只跑一个 thread。上一个 thread 结束时由上级 thread 开出下一个 thread 的 scope。

## 五、开始一个 Thread

打开一个新 thread 时，按照这个流走：

1. **如果没有 scope** → 先讨论 scope，写到 `decisions/[层级]/[thread名]/scope.md`
2. **读 scope**，明确这个 thread 要达成什么、不在范围内的是什么
3. **聚焦讨论**——scope 外的话题记下来放入 handoff 的 Next Steps，不展开
4. **产出**——讨论中确认的决策写成 ADR（`what + why + avoided` 三段式）
5. **结束时产出 handoff**——命名 `[层级]-[主题]-[日期].md`，四个字段：Current State / Decisions Made / Context / Next Steps
6. **一次 commit → 一次 push**——thread 是连贯的工作单元。格式：`[层级] [thread名]：[一句话总结做了什么]`

handoff 的详细规范在 `docs/decisions/L1/project-foundation/session-handoff.md`，工作流的完整 ADR 在 `docs/decisions/L1/project-foundation/workflow.md`。

## 六、交接与进度

进度不由看板管理，而是由 decisions/ 的目录树和 handoff 自然表达：

- 打开 `decisions/L1/` → 看到几个 thread 文件夹 = L1 做了几轮工作
- 打开一个 thread 文件夹 → scope.md 说目标、ADR 说决策、handoff 说 next steps
- 跨层流转：L2 handoff 产出后，L1 读它、讨论、开出下一个 L2 scope

## 七、上下文预算

LLM 的 context window 是有限资源。每次工作时不全文载入所有引用文件——按需加载。
