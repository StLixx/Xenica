# scope · v5.0.0-frontend-fast-path

**Layer**: L1
**Status**: planning
**Goal**: 完成第一个可用无 Bug 的 web 页面

---

## 目标

不做"完整设计系统 / 组件库 / 多主题切换"的过度工程。走一条快路径：

```
design-system (antd default dark) → 组件 (antd 自带 72 个) → 页面设计 → 代码实现
```

**第一个产出物**：一个能跑通、无 bug 的 web 页面（Home 节点页之类，scope 内再定）。

## 流程

1. **Adopt antd 6 生态 + 默认 dark default** —— 第一个 ADR
2. **确定配套技术栈**（React 必选，状态管理 / 路由 / icon / 图引擎 / 工具栈选型）—— 第二个 ADR
3. 后续 ADR 逐步讨论（在推进页面设计前定下来）

## in scope

- antd 6 + antd CLI + antd MCP + antd skill 引入
- 默认 `algorithm: theme.darkAlgorithm`，使用 antd 自带 token
- 不自定义 color token / 字体 / 圆角 / shadow
- 配套技术栈（React + 状态管理 + 路由 + 图引擎 + 周边包）

## out of scope

- 多主题切换 / 浅色主题（先 dark only）
- Design System 自研 token
- 自研组件库（除 antd 组件外的自研）
- AppShell / Header / Sidebar 的最终视觉稿（**先跑通页面骨架**）

## 待讨论

- 第一个实际页面是什么（Home 节点页 / Settings / Empty）
- 图引擎引入时机
- 路由 / 状态管理选型细节

后续 ADR 写明。
