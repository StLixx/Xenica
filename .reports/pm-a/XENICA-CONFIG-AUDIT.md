# Xenica 配置审计报告

**日期**: 2026-02-12
**审计范围**: provider source, llm_endpoint, llm_model, module structure

---

## 信息源

| 源 | 文件 |
|----|------|
| 代码实际值 | `backend/src/config.rs` |
| 文档 | `README.md` |
| 架构权威 | `docs/ARCH.md` (唯一可信来源) |
| LLM 客户端 | `backend/src/llm/client.rs` |

---

## 配置对比

| 配置项 | `config.rs` 实际值 | `README.md` | `ARCH.md` | 状态 |
|--------|-------------------|-------------|-----------|------|
| 端口 | `3002` | `3001` | 未明确 | ⚠️ README 过期 |
| LLM 端点 | `http://127.0.0.1:8092/v1/chat/completions` | `http://127.0.0.1:8045/v1/chat/completions` | Windsurf Bridge（8092） | ✅ 代码=ARCH，README 过期 |
| LLM 模型 | `gpt-4.1` | `gemini-3-flash` | 默认 gpt-4.1 | ✅ 代码=ARCH，README 过期 |
| DB 路径 | `data` | `data` | — | ✅ 一致 |
| Vision 模型 | `gpt-4.1` (硬编码常量) | — | — | ℹ️ 不可配置 |

---

## 模块结构

```
backend/src/
├── main.rs          (115 行) — 入口，路由注册，30+ 端点
├── config.rs        (31 行)  — AppConfig，4 个环境变量
├── api/
│   ├── mod.rs       (17 B)
│   └── routes.rs    (102 KB) — ⚠️ 巨型单文件，所有路由处理器
├── db/
│   ├── mod.rs       (38 B)
│   ├── connection.rs (612 B) — SurrealDB 初始化
│   └── schema.rs    (4.4 KB) — 表/索引定义
├── extraction/
│   ├── mod.rs       (19 B)
│   └── pipeline.rs  (11.8 KB) — 对话→节点/边提取
└── llm/
    ├── mod.rs       (17 B)
    └── client.rs    (4.3 KB) — OpenAI 兼容 chat + vision OCR
```

---

## 结论

1. **代码配置正确** — `config.rs` 与 `ARCH.md` 完全一致
2. **README.md 需同步** — 端口、LLM 端点、LLM 模型三项全部过期
3. **`routes.rs` 102KB** — 技术债，建议按功能域拆分
4. **Vision 模型硬编码** — `VISION_MODEL = "gpt-4.1"` 不走环境变量，若需切换需改代码

### 建议操作

- [ ] 更新 `README.md` 配置表（端口 3002、端点 8092、模型 gpt-4.1）
- [ ] 考虑将 `VISION_MODEL` 提升为 `AppConfig` 字段
- [ ] 规划 `routes.rs` 拆分（按 moments/conversations/graph/import 等域）
