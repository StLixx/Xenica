## L2 / infrastructure-setup

> 这是 Xenica 项目在 core-capabilities 下的**第一个 L2 thread**。负责安装和配置 Phase 2 需要的所有基础设施——PG 扩展、环境变量、索引创建。不写业务逻辑代码。

## 来源

L1 core-capabilities thread。

## 目标

把 search-index ADR 和 import-pipeline ADR 中定义的基础设施在本地环境中全部配好，让下一个 L2 thread（search-import-impl）可以直接开始写代码。

## 输入（继承自 L1 core-capabilities）

- **search-index ADR**：独立表 `search_index`、nodes 加 `embedding vector(1024)` + HNSW 索引、zhparser 中文分词配置、PG 原生 english 配置
- **import-pipeline ADR**：ImportHandler trait 定义（仅作参考，本 thread 不写 handler 实现）
- **embedding 模型**：BGE-M3 via 硅基流动 API，密钥已提供

## 范围

### 1. 安装 PG 扩展

- `pgvector`：向量相似搜索扩展
- `zhparser`：中文分词扩展
- 验证扩展安装成功（`SELECT * FROM pg_extension`）

### 2. 创建 search_index 表

```sql
CREATE TABLE search_index (
    node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    fts_vector tsvector NOT NULL,
    PRIMARY KEY (node_id, language)
);
CREATE INDEX idx_search_index_fts ON search_index USING gin(fts_vector);
```

### 3. 配置中文全文搜索

```sql
CREATE TEXT SEARCH CONFIGURATION zh_cn (PARSER = zhparser);
ALTER TEXT SEARCH CONFIGURATION zh_cn ADD MAPPING FOR n,v,a,i,e,l WITH simple;
```

### 4. nodes 表加向量列

```sql
ALTER TABLE nodes ADD COLUMN embedding vector(1024);
CREATE INDEX idx_nodes_embedding ON nodes USING hnsw (embedding vector_cosine_ops);
```

### 5. 环境变量

在 `backend/.env` 中新增：
```
SILICONFLOW_API_KEY=sk-xxx
SILICONFLOW_EMBEDDING_MODEL=BAAI/bge-m3
```

### 6. 验证

- `to_tsvector('zh_cn', 'Rust的所有权机制')` 返回正确的分词结果
- `to_tsvector('english', 'borrow checker')` 返回正确的英文分词
- `embedding` 列可以插入 `<vector(1024)>` 类型的值并正确读取

## 不在范围

- 任何 Rust 代码（handler、embedding 调用、搜索端点）→ 留给 search-import-impl
- Worker 队列的建表 → 留给 search-import-impl
- MinerU CLI 子应用的安装 → 留给对应的 handler L3 thread

## 终止条件

1. `pgvector` 扩展已安装，`vector(1024)` 类型可用
2. `zhparser` 扩展已安装，`zh_cn` 文本搜索配置已就绪
3. nodes 表有 `embedding vector(1024)` 列 + HNSW 索引
4. `search_index` 表已创建，GIN 索引已建
5. 中英文分词测试通过
6. 环境变量已配置，硅基流动 API 密钥可用（可通过 curl 测试 API 连通性）
