# 0011 — 在同仓维护 Excalidraw 原生扩展适配

状态：实施中。上游 SDK 固定 0.18.1（锁文件含产物完整性）；升级必须重跑实际画板回归。

分析发现 SDK 的公开 `Button` 是面板按钮，主工具栏则是内部 `ToolButton`。此前用面板按钮再覆盖颜色、尺寸，造成两套结构和交互状态。现在从原生 ToolButton DOM 适配一个同仓组件，使用 SDK 自带 ToolIcon CSS，不再维护第二套按钮颜色与尺寸。

来源（Tier S）：[ToolButton.tsx](https://github.com/excalidraw/excalidraw/blob/v0.18.1/packages/excalidraw/components/ToolButton.tsx)、[ToolIcon.scss](https://github.com/excalidraw/excalidraw/blob/v0.18.1/packages/excalidraw/components/ToolIcon.scss)，许可保存在 `web/src/sketch/upstream/LICENSE`。

改动：只保留扩展需要的同步按钮；用原生 checkbox 相邻选择器表达面板开关，并保留真正 button 的键盘与 disabled 行为。主工具容器沿用 App-toolbar-container；面板、菜单、嵌入和画布仍走 SDK 接口。没有复制整套编辑器或修改上游绘图引擎。

维护入口：`web/src/sketch/upstream/ToolButton.tsx`；行为和桌面/窄屏实际样式在 `web/e2e/sketch-ui.spec.ts`。维护者须对照锁定版本源码更新，不能只改独立 CSS 让截图碰巧一样。所有适配改动、理由和回归均进同一仓库。
