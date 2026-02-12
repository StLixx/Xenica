# Xenica 开发状态

**最后更新**: 2026-02-13

---

## 技术栈

| 组件 | 选型 | 端口 |
|------|------|------|
| 后端 | Rust + Axum | 3002 |
| 数据库 | SurrealDB（嵌入式，RocksDB） | — |
| 前端 | React + TypeScript + TailwindCSS + react-flow | 5173/5174 |
| LLM | Windsurf Bridge Raw（8092）→ gpt-4.1 | — |
| 提取 | Notion Bridge（8090）→ claude-sonnet-4 | — |

启动后端需要：`$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"`

---

## 模块状态

| 模块 | 后端 | 前端 | 真实可用度 | 说明 |
|------|------|------|-----------|------|
| X0 骨架 | ✅ | ✅ | 可用 | 项目初始化 + SurrealDB + 基础 API |
| X1 对话引擎 | ✅ | ⚠️ | 待验证 | 多对话 + AI 记忆策略 |
| X2 提取流水线 | ✅ | — | 待验证 | 对话 → 节点/边自动提取 |
| X3 图谱查询 | ✅ | ⚠️ | 待验证 | 联想链/语义搜索/PageRank |
| X4 前端 | — | 🔴 | **不可用** | 19 组件 Agent 生成，特别丑，需全部重做 |
| X5A 语音输入 | ✅ | ⚠️ | 待验证 | Web Speech API |
| X5B 拍照 OCR | ✅ | ⚠️ | 待验证 | Gemini Flash 视觉识别 |
| X5C 视频导入 | ✅ | ⚠️ | 待验证 | B站/YouTube/抖音摘要 |
| X5D Markdown 导入 | ✅ | ⚠️ | 待验证 | Obsidian `[[双链]]` 自动转边 |
| X5E PDF 导入 | ✅ | ⚠️ | 待验证 | MinerU + Gemini Flash |
| X6 间隔重复 | ✅ | ⚠️ | 待验证 | 打开提醒/融入对话/独立卡片 |
| X7 输出生成 | ✅ | ⚠️ | 待验证 | 对话→文章/选节点→生成 |
| X8 主动服务 | ✅ | ⚠️ | 待验证 | 间隔重复/目标对齐/AI 爬取 |

---

## 设计参考资料

| 文件 | 内容 | 路径 |
|------|------|------|
| ARCH.md | 完整设计哲学、交互细节、模块拆分 | `docs/ARCH.md` |
| colorschemes.html | 三套配色方案（琥珀暖光/靛蓝墨水/橄榄森林）深浅双模式 | `design_samples/` |
| layout.html | 桌面端布局（图谱主区 + 对话侧栏 + 底部搜索栏） | `design_samples/` |
| graph_nodes.html | 图谱节点视觉样式 | `design_samples/` |
| graph_edges.html | 图谱边样式（语义/时空/感官/演化四种） | `design_samples/` |
| mobile.html | 手机端布局（底部 Tab + 快速记录大按钮） | `design_samples/` |
| VISION_NOTES | Xenica 设计讨论全记录 | `C:\dev\Commader\docs\references\VISION_NOTES_20260206.md` |
| CONVERSATION_REF | 知识可视化需求用例 | `C:\dev\Commader\docs\references\CONVERSATION_REF_20260206.md` |

---

## 前端组件清单（19 个，全部需重做）

| 组件 | 对应模块 | 重做优先级 |
|------|---------|-----------|
| ChatPanel.tsx | X1 对话 | **P0** — 核心体验 |
| GraphView.tsx | X4 图谱 | **P0** — 核心体验 |
| XenicaNode.tsx | X4 图谱 | **P0** — 节点渲染 |
| XenicaEdge.tsx | X4 图谱 | **P0** — 边渲染 |
| SearchPalette.tsx | X3 搜索 | **P1** — VS Code 命令面板式 |
| NodeDetail.tsx | X4 详情 | P1 — 节点详情面板 |
| TopBar.tsx | 布局 | P1 — 桌面端顶栏 |
| BottomNav.tsx | 布局 | P1 — 桌面端底部栏 |
| MobileTabBar.tsx | 手机端 | P2 — 手机底部导航 |
| QuickRecord.tsx | X5 快速记录 | P2 — 手机端 3 秒记录 |
| NotificationPanel.tsx | 通知 | P2 — 铃铛通知中心 |
| ReviewCards.tsx | X6 间隔重复 | P2 — 卡片翻转 |
| Timeline.tsx | 视图 | P2 — 时间线视图 |
| ListView.tsx | 视图 | P2 — 列表视图 |
| GoalSetup.tsx | X8 目标 | P3 — 首次启动引导 |
| Settings.tsx | 设置 | P3 |
| VoiceMicButton.tsx | X5A 语音 | P3 |
| MarkdownImport.tsx | X5D 导入 | P3 |
| OfflineSync.tsx | 离线 | P3 — PWA 同步 |

---

## 已知问题

| 问题 | 优先级 | 状态 |
|------|--------|------|
| 前端 19 个组件 Agent 生成，视觉质量极差 | **P0** | 🔴 待重做 |
| 整体 UX 未做真实用户审查 | **P0** | 🔴 |
| 核心链路（对话→提取→图谱显示）端到端未验证 | P1 | 🟡 待验证 |
| 后端 API 实际可用性未验证 | P1 | 🟡 待验证 |
| 配色方案未应用到实际组件 | P1 | 🟡 |
| 对话锚点（右侧圆点 + 毛玻璃）未实现 | P1 | 🟡 |
| 手机端适配未验证 | P2 | 🟡 |

---

## 下一步

1. **验证后端** — 启动 Rust 后端，确认 SurrealDB + API 正常
2. **验证核心链路** — 对话 → 提取节点 → 图谱显示
3. **重做 P0 组件** — ChatPanel + GraphView + XenicaNode + XenicaEdge
4. **应用设计语言** — 按 design_samples/ 的配色、布局、节点样式
5. **重做 P1 组件** — SearchPalette + NodeDetail + TopBar + BottomNav
6. **端到端测试** — Playwright 逐页截图验证
