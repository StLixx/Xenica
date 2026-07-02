> ⚠️ **过时文档** — 此文档为历史版本，仅作参考。请勿基于此文档进行开发.

> ⚠️ **过时文档** — 此文档为历史版本，仅作参考。请勿基于此文档进行开发。

# Xenica 开发状态

**最后更新**: 2026-02-15

> ⚠️ **数据库选型变更（2026-02-15 决策）**：SurrealDB → SQLite + sqlx + sqlite-vec。
> 核心理由：sqlx 提供编译期 SQL 验证，vibe coding 下比 SurrealDB 运行时字符串查询稳定得多。
> 当前后端代码仍为 SurrealDB，需要重构。详见 `corpus/exploratory/2026-02-15_知识管理工具演化与技术选型.md`。

---

## 技术栈

| 组件 | 选型 | 端口 |
|------|------|------|
| 后端 | Rust + Axum | 3002 |
| 数据库 | SQLite + sqlx（编译期验证）+ sqlite-vec（向量） | — |
| 前端 | React + TypeScript + TailwindCSS + react-flow | 5173/5174 |
| LLM | ~~Windsurf Bridge Raw（8092）~~ ❌ 已封存 → 需切换为 Antigravity（8045）或 Notion Bridge（8090） | — |
| 提取 | Notion Bridge（8090）→ claude-sonnet-4 | — |

启动后端需要：`$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"`

---

## 模块状态

| 模块 | 后端 | 前端 | 真实可用度 | 说明 |
|------|------|------|-----------|------|
| X0 骨架 | ✅ | ✅ | 需重构 | 项目初始化 + 基础 API。**数据库决策已变更：SurrealDB → SQLite + sqlx**，后端需重构 |
| X1 对话引擎 | ✅ | ✅ | ⚠️ 需重配 LLM | 多对话 + AI 记忆策略，~~Bridge 8092 已封存~~，需切换 Provider |
| X2 提取流水线 | ✅ | — | 待验证 | 对话 → 节点/边自动提取 |
| X3 图谱查询 | ✅ | ✅ | **可用** | 联想链/语义搜索/PageRank，图谱显示真实数据 |
| X4 前端 | — | ✅ | **可用** | 19 组件已实现，CSS 1749 行完整主题系统，TSC 零错误 |
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

## 前端组件清单（19 个，实际审查结论）

> **2026-02-13 审查结论**：前端代码质量远超预期。
> - CSS 1749 行，3 主题（琥珀/靛蓝/橄榄）× 2 模式（深/浅）= 6 套完整配色
> - CSS 变量值完全匹配 design_samples/colorschemes.html
> - 字体层级（Noto Serif SC 标题 + Inter/Noto Sans SC 正文）已实现
> - 交互反馈（hover/active/focus）全局覆盖
> - 响应式（768px 断点）已实现
> - TypeScript 零编译错误
> - 组件**不需要全部重做**，仅需精调和后端联调

| 组件 | 对应模块 | 重做优先级 |
|------|---------|-----------|
| ChatPanel.tsx | X1 对话 | ✅ 805 行，锚点圆点+毛玻璃+Markdown渲染已实现 |
| GraphView.tsx | X4 图谱 | ✅ react-flow 集成，需后端数据验证 |
| XenicaNode.tsx | X4 图谱 | ⚠️ 需对照 graph_nodes.html 精调 |
| XenicaEdge.tsx | X4 图谱 | ⚠️ 需对照 graph_edges.html 精调 |
| SearchPalette.tsx | X3 搜索 | ✅ Ctrl+K 快捷键已实现 |
| NodeDetail.tsx | X4 详情 | ✅ 节点详情面板 |
| TopBar.tsx | 布局 | ✅ 桌面端顶栏（手机端隐藏） |
| BottomNav.tsx | 布局 | ✅ 桌面端底部栏 |
| MobileTabBar.tsx | 手机端 | ✅ 手机底部导航+快速记录大按钮 |
| QuickRecord.tsx | X5 快速记录 | ✅ 弹窗式记录+OCR+视角标签 |
| NotificationPanel.tsx | 通知 | ✅ 铃铛通知中心 |
| ReviewCards.tsx | X6 间隔重复 | ✅ 3D 翻转卡片+4 级反馈 |
| Timeline.tsx | 视图 | ✅ 时间线视图 |
| ListView.tsx | 视图 | ✅ 列表视图+侧边栏标签过滤 |
| GoalSetup.tsx | X8 目标 | ✅ 3 步引导流程 |
| Settings.tsx | 设置 | ✅ 主题切换+视角管理+数据导出 |
| VoiceMicButton.tsx | X5A 语音 | ✅ Web Speech API |
| MarkdownImport.tsx | X5D 导入 | ✅ 拖拽上传+PDF 支持 |
| OfflineSync.tsx | 离线 | ✅ PWA ServiceWorker |

---

## 已知问题

| 问题 | 优先级 | 状态 |
|------|--------|------|
| ~~前端 19 个组件视觉质量极差~~ | — | ✅ 实际审查：质量良好 |
| ~~配色方案未应用到实际组件~~ | — | ✅ 3×2=6 套完整配色已实现 |
| ~~对话锚点（右侧圆点 + 毛玻璃）未实现~~ | — | ✅ ChatPanel 已实现 |
| 后端 `cargo check` 通过（1 warning: unused struct Record） | P1 | ✅ 已验证 |
| 核心链路（对话→提取→图谱显示） | **P0** | ✅ 图谱+时间线+列表均显示真实数据 |
| XenicaNode/XenicaEdge 已对照 design_samples 精调 | P1 | ✅ font-weight 已对齐 |
| React key 冲突（Timeline/ListView/NotificationPanel/SearchPalette/ReviewCards/ChatPanel） | P1 | ✅ 全部修复并提交 |
| ChatPanel 对话历史 SurrealDB ID 崩溃（conv.id.slice is not a function） | **P0** | ✅ 已修复并提交 |
| 3 套主题 × 2 模式切换验证 | P1 | ✅ 琥珀/靛蓝/橄榄 + 深色/浅色 全部正常 |
| 手机端 375px 响应式 | P2 | ✅ 布局正确，底部 Tab + 快速记录按钮 |
| 后端: /api/graph/traverse 500 Serialization error | **P0** | ✅ **已修复** — 根因：SurrealDB v2 SDK Thing 枚举无法反序列化为 serde_json::Value，改用 typed struct 反序列化 |
| 图谱边连接渲染 | **P0** | ✅ **已实现** — 点击节点后显示琥珀色连线，边端点 ID 去除 table 前缀匹配 react-flow 节点 |
| 后端: /api/graph/top 返回边 | P1 | ✅ **已实现** — 初始加载 30 节点 + 21 条去重边，SQL GROUP BY 去重 |
| NodeDetail 关联列表 | P1 | ✅ **已实现** — 点击节点显示 13 条关联（节点名+描述+类型标签） |
| 边 hover 提示 | P2 | ✅ 已实现 — 悬停显示关系描述 |
| 边去重（后端+前端） | P2 | ✅ 后端 SQL GROUP BY + 前端 Set 双重去重（33→21） |
| 全局 ErrorBoundary | P1 | ✅ 已添加，防止白屏崩溃 |
| 前端 console 0 error 0 warning | P1 | ✅ 修复 deprecated meta tag + 全视图验证 |
| ChatPanel 模型选择器显示空白 | P1 | ✅ MODEL_OPTIONS 改为 Bridge 实际模型名 |
| 对话发送 500 error decoding response body | **P0** | ✅ 根因：前端默认 model "claude-sonnet" Bridge 不认识 + 后端不检查 HTTP 状态码就反序列化 |
| LLM client chat() 返回 reqwest::Error 无描述 | P1 | ✅ 改为 Result<String, String> 返回清晰错误信息 |
| AI 回复纯文本显示（无 Markdown 渲染） | P1 | ✅ 添加 react-markdown + prose-chat CSS 样式（标题/列表/代码块/引用） |
| 多轮对话上下文保持 | P1 | ✅ 已验证——2轮追问上下文正确 |
| .gitignore 完善 | P2 | ✅ 补充 node_modules/IDE/OS/Agent临时产物 |
| README.md 配置同步 | P2 | ✅ 端口 3002、端点 8092、模型 gpt-4.1 |
| cargo check 0 warnings | P2 | ✅ 移除未使用的 Record struct |

---

## 下一步

1. ~~**启动后端**~~ ✅ cargo run 成功，SurrealDB + API 正常
2. ~~**验证核心链路**~~ ✅ 图谱+时间线+列表均显示真实数据
3. ~~**精调图谱节点/边**~~ ✅ font-weight 对齐 design_samples
4. ~~**端到端测试**~~ ✅ Playwright 逐页截图验证通过
5. ~~**手机端验证**~~ ✅ 375px 响应式已验证
6. ~~**配置 Bridge**~~ ✅ LLM Bridge（8092）对话链路已通——修复默认模型名(gpt-4.1)、LLM client HTTP 状态码检查、模型选择器显示
7. ~~**graph_top 返回边**~~ ✅ 初始加载 30 节点 + 33 条边
8. **验证 X5/X6/X7/X8 模块** — 语音/OCR/视频/复习/生成/主动服务

