## L2 / search-import-impl / Session Handoff

**日期**: 2026-07-07
**来源 scope**: [scope.md](scope.md)

---

## Current State

search-import-impl 的核心搜索能力已全部完成并端到端测试通过。Worker 四队列状态机已就绪。embedding 异步生成流程已跑通。全文搜索索引在创建节点时同步写入。

以下 scope 终止条件已达成：

| # | 条件 | 结果 |
|------|------|------|
| 1 | POST /nodes 后 embedding 自动填充 | ✅ Worker 2 秒轮询 |
| 2 | GET /nodes/search fulltext zh | ✅ |
| 3 | GET /nodes/search fulltext en | ✅ |
| 4 | GET /nodes/search semantic | ✅ |
| 5 | GET /nodes/search hybrid (RRF) | ✅ |
| 6 | Worker 四队列状态机跑通 | ✅ |

以下未完成：

| # | 条件 | 原因 |
|------|------|------|
| 7 | POST /import（纯文本）→ 创建节点 | 需要实现 HandlerRegistry + ExternalCliHandler |
| 8 | POST /import（图片）→ 图片存储 + 创建引用节点 | 同上 |

---

## Decisions Made

- **EmbeddingProvider trait 放弃 dyn dispatch**：Rust impl Trait 在返回位置不兼容 dyn object。当前用 Arc<SiliconFlowEmbedder>，未来可改写为 enum 分发或 Box<dyn> 配合 RPITIT（Rust 2026+）
- **搜索全文查询用 plainto_tsquery 而非 to_tsquery**：用户输入是自然语言，不需要自己写 `&` `|` 操作符，plainto_tsquery 自动按空格分词做 AND
- **ts_config 作为 SQL 字面量**：zh_cn / english 两个解析器不能作为 bind 参数（PG 的 plainto_tsquery 第一个参数必须是 regconfig 类型的字面量），用 format! 拼接
- **RRF k=60**：业界标准平滑常数，与 Supabase 的 hybrid search 文档一致

---

## Context for Next Session

### 需要完成的代码（下一个 session）

1. **HandlerRegistry**：HashMap<String, Box<dyn ImportHandler>>，key = MIME type
2. **ExternalCliHandler**：Cross-process adapter，通过 stdin/stdout 和独立子项目通信
3. **PureTextHandler**：读 .txt/.md 文件内容 → 直接创建节点
4. **ImageHandler**：存图片文件 → 创建节点引用文件路径
5. **POST /import 端点**：接收 multipart 文件 + MIME type → 路由 handler → 入 Main Queue
6. **路由注册 /nodes/import**：注意与现有 /nodes/{id} 不冲突（静态路由 > 动态路由）

### 启动命令

```bash
docker compose up -d                    # 启动 Docker PG
cd backend && cargo run -- serve       # 启动后端
cargo run -- search "query" -m hybrid  # CLI 搜索
```

### 文件结构

```
backend/src/
├── embedding.rs     # SiliconFlowEmbedder
├── worker.rs        # Worker 后台轮询 + 任务处理
├── handlers.rs      # 所有 HTTP handler（含 search_nodes、create_node 已改造）
├── db.rs            # 数据库操作（含全文/语义搜索、任务CRUD、embedding更新）
├── models.rs        # 数据结构（含 Task、SearchQuery）
└── main.rs          # 入口 + CLI + 路由注册
```
