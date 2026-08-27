## L2 / search-import-impl / Session Handoff

**日期**: 2026-07-08
**来源 scope**: [scope.md](scope.md)

---

## Current State

search-import-impl 的核心搜索能力、Worker 四队列状态机、embedding 异步生成和 ImportHandler 注册表 + POST /import 端点已全部完成。全文搜索索引在创建节点时同步写入（中英双行）。所有 8 条 scope 终止条件均已达成。

### Scope 终止条件达成情况（最终）

| # | 条件 | 结果 |
|------|------|------|
| 1 | POST /nodes 后 embedding 自动填充 | ✅ Worker 2 秒轮询 |
| 2 | GET /nodes/search fulltext zh | ✅ |
| 3 | GET /nodes/search fulltext en | ✅ |
| 4 | GET /nodes/search semantic | ✅ |
| 5 | GET /nodes/search hybrid (RRF) | ✅ |
| 6 | Worker 四队列状态机跑通 | ✅ |
| 7 | POST /import（纯文本）→ 创建节点 | ✅ PureTextHandler + multipart 端点 |
| 8 | POST /import（图片）→ 图片存储 + 创建引用节点 | ✅ ImageHandler + multipart 端点 |

### Final commit

* `[L2] search-import-impl: Implement ImportHandler registry and POST /import pipeline`（7c7e71c，9 文件 / 472 插入 / 8 删除）
* 推送到 `origin/master`

### E2E 验证

| 测试 | 请求 | DB 节点内容 |
|------|------|------|
| 1 | POST /nodes/import（multipart, text/markdown, user_notes） | `# Rust 所有权机制 ... --- [User Notes] 这是我手动添加的笔记` |
| 2 | POST /nodes/import（multipart, image/png, user_notes） | `[Image]: ./uploads/<uuid>.png \n\n 截图保存` |

### 已知 warnings（不影响运行）

`cargo build` 报 4 个 dead_code warnings：

* `ImportContext.pool` — 字段保留供未来 handler 内部查询使用
* `ImportError::UnsupportedMimeType(String)` — variant 保留供未来 HandlerRegistry 路由失败时显式报错
* `HandlerRegistry::supported()` — 方法保留供未来 GET /import/supported 端点暴露
* `ExternalCliHandler` — 类型保留供未来 MinerU / Video CLI 子项目适配

---

## Decisions Made

### 搜索

- **EmbeddingProvider trait 放弃 dyn dispatch**：Rust impl Trait 在返回位置不兼容 dyn object。当前用 `Arc<SiliconFlowEmbedder>`，未来可改写为 enum 分发或 `Box<dyn>` 配合 RPITIT（Rust 2026+）
- **搜索全文查询用 plainto_tsquery 而非 to_tsquery**：用户输入是自然语言，不需要自己写 `&` `|` 操作符，plainto_tsquery 自动按空格分词做 AND
- **ts_config 作为 SQL 字面量**：zh_cn / english 两个解析器不能作为 bind 参数（PG 的 plainto_tsquery 第一个参数必须是 regconfig 类型的字面量），用 `format!` 拼接
- **RRF k=60**：业界标准平滑常数，与 Supabase 的 hybrid search 文档一致

### 导入管道（本次新加入）

- **ImportHandler trait + HandlerRegistry 模式**：核心只认 trait，不认实现。`HashMap<String, Arc<dyn ImportHandler>>` 按 MIME type 路由
- **库内直调 vs 独立子项目两条路径**：纯文本/图片库内直接处理；PDF（MinerU）/ 视频（ffmpeg 管道）通过 `ExternalCliHandler` 跨进程适配，stdin/stdout 走 JSON contract
- **`db::insert_node_raw` 镜像 `db::create_node` 的 search_index 双行写入**：两条代码路径必须保持搜索索引同步——否则导入的节点会从全文搜索中消失（这是数据一致性的隐含约束）
- **MIME type 由前端声明**，而不是从文件扩展名嗅探：HTTP multipart 头的 Content-Type 字段作为唯一路由依据，避免路径/扩展名/魔数三种来源不一致带来的歧义
- **`user_notes` 字段统一追加到文本 handler 输出的 `--- [User Notes] ...` 段**：保留所有原有内容，notes 区块分隔。这是为"先语音标注、后整理"使用场景的最小实现
- **音频转写默认模型**：硅基流动当前仅提供 `FunAudioLLM/SenseVoiceSmall` 和 `TeleAI/TeleSpeechASR`（Whisper 已不在线）。MVP 选 `TeleSpeechASR`（60 种方言混说、中文场景优势），保持和 BGE-M3 embedding 同样的鉴权/账单/调用风格。`ADR: import-pipeline` 已同步修正

### 库与依赖

- **Cargo.toml 新增**：`axum = { version = "0.8", features = ["multipart"] }` 和 `thiserror = "1"`
- **`multipart` feature 是必需**：axum 0.8 把 `Multipart` 类型锁在 feature flag 后面——不加就拿不到 `axum::extract::Multipart`

---

## Context for Next Session

### Phase 2 段 B 待开 thread（不属本 thread）

| 子项目 | 应开的 thread | 仓库定位 |
|--------|--------------|---------|
| MinerU CLI | L2 / v3.3.0-mineru-cli-handler/ | 独立仓库（Python），通过 ExternalCliHandler 适配接入 |
| 视频 PPT+字幕 CLI | L2 / v3.4.0-video-ppt-handler/ | 独立仓库（Python），ffmpeg + imagehash + TeleSpeechASR |
| Batch 连边 UX | 待 L1 重启 thread 决定 | 前端主导 |

### 启动命令

```bash
docker compose up -d                    # 启动 Docker PG
cd backend && cargo run -- serve       # 启动后端
cargo run -- search "query" -m hybrid  # CLI 搜索
# E2E 测试两个新端点：
curl -X POST -F "file=@note.md" -F "mime_type=text/markdown" -F "user_notes=..." \
  http://127.0.0.1:3000/nodes/import
curl -X POST -F "file=@image.png" -F "mime_type=image/png" -F "user_notes=..." \
  http://127.0.0.1:3000/nodes/import
```

### 最终文件结构

```
backend/src/
├── embedding.rs     # SiliconFlowEmbedder
├── worker.rs        # Worker 后台轮询 + 任务处理
├── handlers.rs      # 所有 HTTP handler（含 search_nodes, create_node, import_file）
├── db.rs            # 数据库操作（含全文/语义搜索、任务CRUD、embedding更新、节点/边低层写入）
├── models.rs        # 数据结构（含 Task, SearchQuery, NewEdgeForImport）
├── import.rs        # ImportHandler trait + HandlerRegistry + PureTextHandler + ImageHandler + ExternalCliHandler
└── main.rs          # 入口 + CLI + 路由注册（含 /nodes/import）
```

---

## 线程状态

**thread 关闭**：本 thread（L2 search-import-impl）已完成全部 8 条终止条件，并已 commit + push 到远端。

后续工作（命名约定重命名、MinerU 子项目、视频子项目）由新 thread 在 L1 层级或 L2 层级独立启动，**不继承本 thread 的上下文**。
