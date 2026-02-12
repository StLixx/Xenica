# CG108 Xenica 配置审计报告

**审计时间**: 2026-02-12
**审计范围**: provider source, llm_endpoint, llm_model, port, db_path, module structure, frontend stack

---

## 数据源对比

| 配置项 | config.rs（代码实际值） | ARCH.md | README.md | 一致性 |
|--------|------------------------|---------|-----------|--------|
| **端口** | `3002` | 未明确写 | `3001` | ❌ README 过时 |
| **LLM 提供方** | Windsurf Bridge (8092) | Windsurf Bridge (8092) | Antigravity API (8045) | ❌ README 过时 |
| **LLM 端点** | `http://127.0.0.1:8092/v1/chat/completions` | Windsurf Bridge 8092 Raw 路径 | `http://127.0.0.1:8045/v1/chat/completions` | ❌ README 过时 |
| **LLM 默认模型** | `gpt-4.1` | `gpt-4.1` | `gemini-3-flash` | ❌ README 过时 |
| **Vision 模型** | `gpt-4.1`（client.rs 硬编码常量） | 未提及 | 未提及 | ⚠️ 未文档化 |
| **DB 路径** | `data` | `backend/data/` | `data` | ✅ 一致 |
| **DB 引擎** | SurrealDB + RocksDB | SurrealDB + RocksDB | SurrealDB + RocksDB | ✅ 一致 |

---

## 逐项详情

### 1. Provider Source（LLM 提供方）

- **代码实际值**: Windsurf Bridge，端口 8092
- **ARCH.md**: `Windsurf Bridge（8092）— Raw 路径，默认 gpt-4.1` ✅
- **README.md**: `Antigravity API（本地代理）` ❌
- **结论**: README 描述的是早期配置（Antigravity 8045），代码已切换到 Windsurf Bridge 8092，ARCH.md 已同步更新，README 未同步。

### 2. LLM Endpoint

- **代码实际值**: `http://127.0.0.1:8092/v1/chat/completions`（config.rs:23）
- **ARCH.md**: 8092 ✅
- **README.md**: `http://127.0.0.1:8045/v1/chat/completions` ❌
- **环境变量覆盖**: `XENICA_LLM_ENDPOINT`
- **结论**: 同上，README 过时。

### 3. LLM Model

- **默认模型（config.rs:25）**: `gpt-4.1` — 对话/提取通用
- **Vision 模型（client.rs:7）**: `gpt-4.1` — OCR 硬编码常量 `VISION_MODEL`
- **ARCH.md 描述**: "Claude Opus（对话）/ Sonnet（提取）/ Gemini Flash（廉价）" — 但实际代码只用 `gpt-4.1`
- **README.md**: `gemini-3-flash` ❌
- **环境变量覆盖**: `XENICA_LLM_MODEL`（仅覆盖默认模型，Vision 模型硬编码不受影响）
- **结论**: ARCH.md 的模型描述是理想设计，代码实际通过 Windsurf Bridge 8092 统一使用 `gpt-4.1`（Bridge 内部路由到实际模型）。README 完全过时。

### 4. Port

- **代码实际值**: `3002`（config.rs:21）
- **README.md**: `3001` ❌
- **环境变量覆盖**: `XENICA_PORT`
- **结论**: 端口已从 3001 改为 3002，README 未更新。

### 5. Module Structure（后端）

```
backend/src/
├── api/          # routes.rs (102KB) — 所有 HTTP 路由
│   ├── mod.rs
│   └── routes.rs
├── config.rs     # AppConfig 配置
├── db/           # SurrealDB 连接 + Schema
│   ├── connection.rs
│   ├── mod.rs
│   └── schema.rs
├── extraction/   # 提取流水线（对话→节点/边）
│   ├── mod.rs
│   └── pipeline.rs (11.8KB)
├── llm/          # LLM 客户端
│   ├── client.rs (4.3KB)
│   └── mod.rs
└── main.rs       # 入口 + 路由注册
```

**已实现的 API 路由**（main.rs）:

| 模块 | 路由 | 状态 |
|------|------|------|
| X0 基础 | /api/health, conversations, moments, entities, search, relations | ✅ |
| X1 对话 | /api/chat, conversations/{id}/messages | ✅ |
| X2 提取 | /api/moments/{id}/extract, conversations/{id}/extract | ✅ |
| X3 图谱 | /api/graph/traverse, top, stats, recalculate, perspectives | ✅ |
| X5B OCR | /api/ocr | ✅ |
| X5C 视频 | /api/import/video | ✅ |
| X5D Markdown | /api/import/markdown | ✅ |
| X5E PDF | /api/import/pdf | ✅ |
| X6 间隔重复 | /api/reviews/due, schedule, respond | ✅ |
| X7 输出 | /api/generate/from-nodes | ✅ |
| X8 Commander | /api/import/commander-log | ✅ |

**结论**: 后端模块结构清晰，ARCH.md 列出的 X0-X8 模块均已有路由。⚠️ `routes.rs` 单文件 102KB 较大，未来可考虑按模块拆分。

### 6. Frontend Stack

| 依赖 | 版本 | ARCH.md 描述 | 状态 |
|------|------|-------------|------|
| React | 19.2.4 | React | ✅ |
| TypeScript | 5.9.3 | TypeScript | ✅ |
| TailwindCSS | 4.1.18 | TailwindCSS | ✅ |
| @xyflow/react | 12.10.0 | react-flow | ✅ |
| Zustand | 5.0.11 | 未提及 | ✅ 状态管理 |
| Vite | 7.2.4 | 未提及 | ✅ 构建工具 |
| Framer Motion | 12.33.0 | 未提及 | ✅ 动画 |
| Lucide React | 0.563.0 | 未提及 | ✅ 图标 |
| react-router-dom | 7.13.0 | 未提及 | ✅ 路由 |
| vite-plugin-pwa | 1.2.0 | PWA Service Worker | ✅ |

**结论**: 前端技术栈与 ARCH.md 完全匹配，额外使用了合理的辅助库。

---

## 需要修复的问题

### P1 — README.md 过时（4 处不一致）

README.md 中以下配置表与代码实际值不符：

| 配置项 | README 写的 | 实际值 |
|--------|------------|--------|
| `XENICA_PORT` | `3001` | `3002` |
| `XENICA_LLM_ENDPOINT` | `http://127.0.0.1:8045/v1/chat/completions` | `http://127.0.0.1:8092/v1/chat/completions` |
| `XENICA_LLM_MODEL` | `gemini-3-flash` | `gpt-4.1` |
| LLM 描述 | Antigravity API（本地代理） | Windsurf Bridge |

### P2 — Vision 模型硬编码

`client.rs:7` 的 `VISION_MODEL` 硬编码为 `gpt-4.1`，无法通过环境变量覆盖。若需切换 Vision 模型需改代码。低优先级，当前可接受。

### P3 — ARCH.md 模型描述 vs 实际

ARCH.md 六、技术栈写的 "Claude Opus / Sonnet / Gemini Flash" 是理想分工描述，实际代码统一通过 Bridge 发送 `gpt-4.1`，由 Bridge 内部路由。描述层面无误，但可能造成新读者困惑。

---

## 总结

| 维度 | 状态 |
|------|------|
| 代码 ↔ ARCH.md | ✅ 基本一致 |
| 代码 ↔ README.md | ❌ 4 处过时 |
| 模块结构 | ✅ 清晰，X0-X8 全覆盖 |
| 前端技术栈 | ✅ 完全匹配 |
| 关键风险 | README 误导（端口/端点/模型全错） |
