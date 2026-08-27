# adopt-antd-ecosystem · 引入 Ant Design 6 生态作为设计系统与组件库

**Layer**: L1
**Status**: accepted
**Date**: 2026-07-14

---

## What

引入 Ant Design 6（antd）作为 Xenica 前端的：

- **设计系统** —— 默认 `darkAlgorithm` + antd 自带 Design Token，**不自定义任何 token**
- **组件库** —— antd 主包 72 个组件
- **AI 加速器** —— `@ant-design/cli` + Antd MCP + `antd` skill

## Why

### 设计系统与组件库同步到位（"快路径"核心）

按照 scope 的快路径 `design-system → 组件 → 页面 → 代码`，如果自研 design system 必须经过：

1. 调研 token 体系（颜色阶梯、字号阶、间距阶）
2. 决策 token 数值（一次最小版本至少 100+ token）
3. 把 token 应用到组件（72 个组件每个都得接 CSS 变量）
4. 验证 design md / Kitchen 主题编辑器

这套流程在 v6.0.0-anrdt-react-flow scope 中走过，**至少一周**。Ant Design 6 已经把这套完整走过来：

- ✅ 100+ design token 已定义（`antd design.md`）
- ✅ 72 个组件已全部接入 token
- ✅ `theme.darkAlgorithm` 一行启用全组件暗色模式
- ✅ `ConfigProvider` 单一入口

### antd 6 在生产稳定（v5-stable 已衰退）

来源 [v6.0.0 release #55804](https://github.com/ant-design/ant-design/issues/55804)（Ant Group 官方 2025-11-22 发布）：

- v5.x 进入 1 年维护期（至 2026-11-22 EOL），不再加新特性
- v6 主线活跃，6.5.0（2026-06-27）已稳定
- v6 走 pure CSS Variables，运行时 bug 面比 v5 cssinjs 更少
- v6 原生支持 React 19，去掉 `v5-patch-for-react-19` 这类兼容包

**决策**：跟随 antd v6 latest，不走 `5.x-stable`。

### 切换成本（react 必随之）

1. **React 必选** —— antd 是 React 组件库，引入 antd ⇒ React 栈
2. **配套技术栈** —— React 19 / 状态管理 / 路由 / icon / 图引擎 / 工具栈 => 在第二个 ADR 决定

## What gets adopted

| 工具 | 用途 | 来源 |
|---|---|---|
| `antd@^6` | UI 组件库 + Design Token + darkAlgorithm | npm |
| `@ant-design/icons@^6` | 800+ 图标 | npm |
| `@ant-design/colors` | 12 步颜色阶梯（如后续要派生色） | npm |
| `@ant-design/cssinjs` | CSS 引擎 | npm |
| `@ant-design/cli` | 本地 CLI，查询组件 API / 文档 / token / 语义 | npm global |
| `antd` MCP | Claude/Cursor 直接读 antd 文档 | MCP server |
| `antd` skill | 8 个 tool + 2 个 prompt，AI agent 集成 | Skill 目录 |

### 默认配置（**不写任何自定义 token**）

```tsx
import { ConfigProvider, theme } from 'antd';

<ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
  <App />
</ConfigProvider>
```

设计系统就这一层。**先不**覆盖任何 `colorPrimary` / `borderRadius` / `fontFamily` —— 等具体页面真有 UX gap 才动。

### antd CLI / MCP / skill 已验证可用（2026-07-13 验证通过）

| 工具 | 验证命令 | 结果 |
|---|---|---|
| Antd MCP | `mcp_antd.antd_list` | ✅ 72 组件全列表 |
| Antd CLI | `antd info Button --version 6 --format json` | ✅ 返回完整 props |
| Ant Design Charts / X / ProComponents / AntV | npm 装时链入 | 待验证（运行时校验） |

## Why not alternatives

| 方案 | 不选的理由 |
|---|---|
| 自研 Design System + 自研组件库 | scope 目标"快路径"被打破 — 至少一周 |
| 续用 Vue + Vuetify | Vuetify 是 Material Design 调性；本次 scope 目标是 antd 6 生态 |
| Element Plus / Naive UI / Arco Vue | 与 Ant Design + AntV 生态不兼容，**Reka / shadcn** 路线只能配一个生态 |
| Antd 5.x-stable | 衰退期，新 bug 不修（已 EOL'ing in 11 个月） |

## Avoided alternatives

- **Ant Design X（AI 应用 UI）** —— Phase 2 才用，先 install 备查但不引入
- **Pro Components** —— enterprise-grade，仅当需要 ProTable / ProForm 才引入（先不）
- **Ant Design Charts / AntV** —— 在第二个 ADR 中**配套技术栈**章节讨论
- **自定义 accent / 自定义字体 / 自定义圆角** —— 全 out of scope（按 scope.md）

## Cost / 风险

| | 估算 |
|---|---|
| 安装时间 | 30 min（npm install antd + icons + cli 已装） |
| 第一个 Hello World | 1 小时 |
| 第一个真实 web 页面（4-LAYER TODO 解码前，先跑骨架） | 半天 |
| 已写 Vue 代码（9 个 .vue） | 全删（旧栈放弃） |

## Verification

1. `npm list react antd` 验证版本对齐
2. `npm run dev` 起 Vite + React + antd
3. AppShell + Hello World + 一个 antd Button 渲染
4. Cli/MCP/skill 验证三连
5. 切换 dark Algorithm 在浏览器内可见

## Unresolved questions（下一个 ADR 解决）

- React 状态管理（zustand / jotai / 内置 useState / Redux）
- 路由（react-router-dom / TanStack Router）
- icon 包（@ant-design/icons 已包含但是否需要 lucide 补充）
- 图引擎（@xyflow/react vs AntV G6）——**与 antv 是何关系**
- 工具栈（Vite / Next.js / Remix）
- Electron 与 web 共享代码的策略

下一个 ADR（**配套技术栈**）紧跟。
