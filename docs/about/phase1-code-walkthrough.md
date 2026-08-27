# Phase 1 代码走读

> 函数级别——我知道每个文件里有哪些函数，每个函数在做什么，数据怎么流动。不看每一行的实现细节。

---

## Cargo.toml —— 依赖清单

声明了 10 个外部库。名字就是它干什么的：

| 依赖 | 作用 |
|------|------|
| `axum` | HTTP 服务器框架——接收请求、路由到 handler、返回响应 |
| `sqlx` | 数据库驱动——连接 PostgreSQL，发 SQL，把结果映射成 Rust struct |
| `tokio` | 异步运行时——Rust 的 `async/await` 需要它来调度 |
| `serde` / `serde_json` | 序列化——Rust struct ↔ JSON 互相转换 |
| `uuid` | 生成和解析 UUID |
| `chrono` | 时间类型——`created_at`、`updated_at` |
| `clap` | CLI 参数解析——把命令行参数映射到 Rust 结构体 |
| `reqwest` | HTTP 客户端——CLI 模式下发请求给 API Server |
| `anyhow` | 通用错误类型——不用自己定义每种错误 |
| `dotenvy` | 从 `.env` 文件读环境变量 |

---

## migration/0001_init.sql —— 数据库建表

4 条 SQL 语句，启动时自动执行：

1. `CREATE TABLE nodes` — 节点表，每行一个知识碎片
2. `CREATE TABLE edges` — 边表，每行一条连接关系
3. `CREATE INDEX idx_edges_source` — source 端的索引，加速"从某个节点出发查它的边"
4. `CREATE INDEX idx_edges_target` — target 端的索引，加速"谁的边指向了某个节点"

两个索引覆盖了 S7（查邻居）的核心读路径。

---

## src/models.rs —— 数据结构定义

没有任何函数逻辑，纯数据定义。6 个 struct：

| struct | 用途 | 读/写 |
|--------|------|-------|
| `Node` | 数据库 nodes 表的一行 → Rust 类型 | 可读（FromRow）可序列化（Serialize） |
| `Edge` | 数据库 edges 表的一行 → Rust 类型 | 同上 |
| `CreateNodeRequest` | CLI 发来的"创建一个节点"请求体 | 只反序列化（Deserialize） |
| `NodeConnection` | 请求体里的连接子项（target_id + label） | 同上 |
| `NeighborNode` | 返回给前端的"邻居信息"——哪个节点 + 用什么边 + 方向 | 只序列化（Serialize） |
| `NodeDetail` | "节点详情"——节点自身 + 所有邻居 | 同上 |

**关键概念**：`Serialize` = Rust struct → JSON 给外面看。`Deserialize` = JSON 进来 → Rust struct 拿来用。`FromRow` = 数据库一行 → Rust struct。

---

## src/db.rs —— 数据库操作层

所有函数签名是 `async fn xxx(pool: &PgPool, ...) -> Result<...>`——接收数据库连接池和参数，返回结果或错误。

### `run_migrations`
> 启动时自动执行 migration SQL。因为 sqlx 不支持"一条 query 里多条 SQL"，所以按 `;` 拆开逐句执行。

### `create_node`
> S1 的核心写操作。**在一个事务里**做两件事：先 INSERT nodes 拿到新节点 ID，再循环 INSERT edges（每条 `--connect` 参数对应一条边）。如果任一步失败，整个事务回滚——保证不会出现"节点建了但边没建"的半成品。

### `get_node`
> 按 ID 查一个节点。`fetch_optional` 表示"可能查到也可能查不到"——查到返回 `Some(node)`，查不到返回 `None`。不会报错。

### `get_neighbors`
> S7 的核心读操作。这函数稍复杂：
> 1. SQL 做 `edges JOIN nodes`，找到所有以目标节点为 source 或 target 的边
> 2. `CASE WHEN` 判断边的方向——如果目标节点是 source 就是 outgoing，否则 incoming
> 3. 排除自身（`WHERE n.id != $1`）
> 4. 查出来的行是一个临时的 `NeighborRow` struct，然后逐条映射成 `NeighborNode`
>
> 为什么多一个 `NeighborRow` struct 不直接用 `NeighborNode`？因为 sqlx 的 `FromRow` 要求字段名和列名一一对应，而 JOIN 查询不能用嵌套类型——所以先映射成平铺的行，再手动组装成嵌套结构。

### `get_node_detail`
> 把 `get_node` + `get_neighbors` 包在一起。查不到节点返回 `None`，查到了就继续查邻居。

### `list_nodes` / `list_edges`
> S6 的全量读取。按创建时间倒序，无过滤无分页。

---

## src/handlers.rs —— HTTP 请求处理层

这一层的职责：**把 HTTP 请求转化为对 db.rs 的函数调用，再把返回值包装成 JSON 响应。**

每个函数的结构高度一致：

```
输入：从 HTTP 请求中提取参数（State = 数据库连接池, Path = URL 里的 {id}, Json = 请求体）
  ↓
调 db.rs 的对应函数
  ↓
输出：成功 → Json(...)，失败 → AppError
```

### `AppState`
> 只有一个字段 `pool: PgPool`。Axum 的 `State` extractor 从这个结构体里取出数据库连接池并注入到每个 handler。`#[derive(Clone)]` 是因为 Axum 要求 State 能被多线程安全复制。

### `AppError` 枚举
> 两种错误：
> - `NotFound(String)` → HTTP 404
> - `Internal(anyhow::Error)` → HTTP 500
>
> `From<anyhow::Error>` 告诉编译器：任何 `anyhow::Error` 都能自动变成 `AppError::Internal`——这样 `db::xxx().await?` 里如果出错了就能自动 `?` 传播，不用手动转换。
>
> `IntoResponse` 告诉 Axum：这个错误类型怎么变成 HTTP 响应——404 或 500 + JSON body。

---

## src/main.rs —— 程序入口

这里是整个程序的启动点。分两套模式：

### 模式 1：Serve（启动服务器）

```
cargo run -- serve
```

1. 从 `.env` 读 `DATABASE_URL` 和 `API_PORT`
2. 创建 PostgreSQL 连接池（最多 5 个连接）
3. 执行 migration
4. 启动 Axum HTTP server，监听 `127.0.0.1:3000`

路由表：

| 方法 | 路径 | handler |
|------|------|------|
| GET | `/nodes` | `list_nodes` |
| POST | `/nodes` | `create_node` |
| GET | `/nodes/{id}` | `get_node` |
| GET | `/nodes/{id}/neighbors` | `get_neighbors` |
| GET | `/edges` | `list_edges` |

`{id}` 是路径参数——`/nodes/abc-123` 里的 `abc-123`。

### 模式 2：CLI 客户端（命令行直接调用 API）

```
cargo run -- create "内容" --connect <UUID>,<label>
cargo run -- show <UUID>
cargo run -- neighbors <UUID>
cargo run -- list
```

这 4 个函数做的事完全一样：用 `reqwest` 发 HTTP 请求到 `http://127.0.0.1:3000`，拿到 JSON 后格式化打印。**前提是 Serve 模式已经在另一个终端跑着。**

### `parse_connection`
> `--connect UUID,label` 格式的解析器。`splitn(2, ',')` 意思是"只按第一个逗号切一刀"——这样 label 里如果包含逗号也不会被误切。

---

## 数据流全景

```
用户终端输入
      │
      ▼
  clap 解析命令
      │
      ├── serve → 启动 Axum → 注册路由 → 监听 :3000
      │
      └── create/show/list 等
              │
              ▼
          reqwest 构造 HTTP 请求
              │
              ▼
          发送到 http://127.0.0.1:3000
              │
              ▼
          Axum 路由匹配 → handler 函数
              │
              ▼
          handler 调 db.rs 函数
              │
              ▼
          sqlx 发 SQL → PostgreSQL
              │
              ▼
          结果逐层返回：PG → sqlx → db.rs → handler → JSON → CLI 打印
```

两层模式共享同一套 db.rs 代码——CLI 只是多走了一层 HTTP，底层逻辑不变。

---

## 阅读建议

第一次看：
1. 先看 `models.rs`——认识所有数据结构
2. 再看 `db.rs`——认识所有对数据库的操作
3. 然后看 `handlers.rs`——理解 HTTP 请求怎么映射到数据库操作
4. 最后看 `main.rs`——搞清楚启动流程和 CLI 命令

不需要看任何一行 `Cargo.lock`。
