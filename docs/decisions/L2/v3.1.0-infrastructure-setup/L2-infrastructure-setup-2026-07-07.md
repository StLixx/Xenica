## L2 / infrastructure-setup / Session Handoff

**日期**: 2026-07-07
**来源 scope**: [scope.md](scope.md)

---

## Current State

Xenica Phase 2 的数据库基础设施已全部配置完毕，后端已可以正常连接。下一个 L2 thread（search-import-impl）无需碰任何基础设施，可以直接开始写 Rust 代码。

### 完成的配置

- **PostgreSQL 运行方式**：从本地安装的 PG 17 切换到了 Docker Compose + 自定义镜像
- **pgvector 0.8.4**：已安装，`vector(1024)` 类型可用，`idx_nodes_embedding` HNSW 索引已建
- **zhparser 2.3**：已安装，`zh_cn` 中文文本搜索配置就绪（映射 n/v/a/i/e/l → simple）
- **search_index 表**：已创建，GIN 索引（`idx_search_index_fts`）已建
- **nodes 表**：已增加 `embedding vector(1024)` 列
- **迁移系统**：`run_migrations()` 支持多个 SQL 文件按顺序执行
- **环境变量**：`backend/.env` 已增加 `SILICONFLOW_API_KEY` 和 `SILICONFLOW_EMBEDDING_MODEL`
- **后端 API**：运行在 `http://127.0.0.1:3000`，`GET /nodes` 正常返回 200

### 端口分配

| 服务 | 端口 |
|------|------|
| 原生 PostgreSQL（已停止但进程自恢复） | 5432 |
| Docker PostgreSQL（xenica-db） | 5433 |
| Xenica 后端 API | 3000 |

---

## Decisions Made

### 1. 放弃原生 PG 安装扩展，改用 Docker

- **选项**：A）用 `pgvector_pgsql_windows` 预编译二进制手动复制；B）编译 zhparser + SCWS 源码；C）Docker
- **选择**：Docker（基于 `abcfy2/zhparser:17` + 安装 `postgresql-17-pgvector`）
- **原因**：Windows 上 `C:\Program Files\PostgreSQL\17` 目录受 TrustedInstaller 保护，无管理员权限无法写入；预编译的 zhparser Windows 二进制不存在
- **放弃**：在原生 Windows PG 上运行——避免每次安装扩展都需要管理员提权

### 2. 使用 5433 端口

- **原因**：原生 PostgreSQL 系统服务在 5432 上持续运行（`Stop-Service` 后进程自恢复）
- **Docker 端口映射**：宿主机 `5433` → 容器内 `5432`
- **`DATABASE_URL`**：已改为 `postgres://postgres:postgres@localhost:5433/xenica`

### 3. 迁移文件分段执行

- **方式**：`run_migrations()` 遍历 `migrations[]` 数组，每个文件按 `;` 分割逐条执行
- **避免**：`DO $$ ... END $$` 块——内部 `;` 会被拆散导致语法错误
- **迁移文件**：`0001_init.sql`（nodes + edges）+ `0002_infrastructure.sql`（embedding + search_index + 索引）

---

## Context for Next Thread

下个 thread 是 `L2 search-import-impl`，需要知道以下背景：

1. **Docker 操作命令**：项目根目录执行 `docker compose up -d` 启动 PG；`docker compose down -v` 重置（会清数据）；`docker compose logs db` 看初始化日志
2. **首次启动等待**：首次需 ~10 秒等待 PG 初始化和 init 脚本执行完毕。后端会自动重试连接（暂未实现重试逻辑——启动后端前确保容器 `healthy`）
3. **zh_cn 分词器的正确名称**：`zh_cn`（不是 `chinese_zh`，后者是 base image 的默认配置名）。索引覆盖了 `n,v,a,i,e,l` 六类词性
4. **PG 原生的 english 分词器**：直接使用 PG 内置 `english` 配置，无需额外安装
5. **HF 索引注意事项**：`idx_nodes_embedding` 使用 `hnsw (embedding vector_cosine_ops)`。插入少量数据时 PG 可能选择顺序扫描而非索引——`SET enable_seqscan = off` 可强制测试
6. **SiliconFlow API 密钥**：`.env` 中当前为 `sk-xxx` 占位符，需替换为真实密钥后才能调用 embedding API。密钥在用户手上

---

## Immediate Next Steps

1. **替换 SiliconFlow API 密钥**——将 `backend/.env` 中的 `SILICONFLOW_API_KEY=sk-xxx` 改为真实密钥
2. **启动后端**——`cd backend && cargo run -- serve`
3. 开始 `L2 search-import-impl` 的实现：
   - 实现 `EmbeddingProvider trait` 的硅基流动适配器（`SiliconFlowEmbedder`）
   - 创建/更新节点时异步生成向量
   - Worker 四队列（Scheduled → Main → Retry → Dead Letter）
   - 搜索端点 `GET /nodes/search?q=...&mode=...&language=zh|en`
   - 导入管道框架（`ImportHandler` + `HandlerRegistry` + `ExternalCliHandler`）
4. 如果 Docker 容器未运行，先执行 `docker compose up -d` 再启动后端
