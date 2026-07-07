## ADR / L1 / core-capabilities / 搜索索引表：独立于 nodes 的多语言全文检索

**状态**: accepted
**日期**: 2026-07-07
**来源 thread**: core-capabilities

## Context

Phase 2 需要给 nodes 表加全文搜索能力（zhparser 中文分词 + PG 默认英文解析器）。方案有两种：在 nodes 表上直接加 `tsvector` 生成列，或者单独建一张 search_index 表。

用户预计未来会加入日语、德语等更多语言。同时用户明确表示一部分计算机科学内容将全部用英文撰写，英文搜索是刚需。

本决策延续 [L1 architecture-foundation 的 data-model ADR](../architecture-foundation/data-model.md)——搜索索引表是对 nodes 表的扩展，不修改 nodes 和 edges 两张核心表的定义。

## Decision

### What

新增独立表 `search_index`，存放多语言的全文检索向量。

```sql
CREATE TABLE search_index (
    node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    language TEXT NOT NULL,         -- 'zh', 'en', 'de', 'ja' ...
    fts_vector tsvector NOT NULL,
    PRIMARY KEY (node_id, language)
);

CREATE INDEX idx_search_index_fts ON search_index USING gin(fts_vector);
```

同时给 nodes 表加向量列：

```sql
ALTER TABLE nodes ADD COLUMN embedding vector(1024);
CREATE INDEX idx_nodes_embedding ON nodes USING hnsw (embedding vector_cosine_ops);
```

### Why

- **扩展语言不需要改 nodes 表**：加一种新语言只需 `INSERT` 一行到 search_index，不是 `ALTER TABLE nodes ADD COLUMN`。nodes 表的列不随语言数量膨胀。
- **英文是刚需**：用户计划用英文撰写计算机科学内容，zhparser 处理不了纯英文的搜词干（"running"→"run"）。独立表挂 PG 原生的 `english` 配置即可。中英两行共存不冲突。
- **索引重建不影响主表**：GIN 索引在独立表上重建不会锁 nodes 表。
- **向量列留在了 nodes 表**：embedding 是节点的固有属性，1:1 映射，没必要拆到独立表。

### What was avoided

- **在 nodes 表加 `tsvector` 生成列**：每加一种语言就多一列，4 种以上 languages 后表臃肿。放弃。
- **用 search_index 存 embedding**：embedding 是每节点一个，拆出去是多一次 JOIN。放弃。
- **在 data-model ADR 中直接描述本决策**：data-model ADR 定义核心表（nodes+edges），搜索索引是扩展表而非核心表。放在 core-capabilities 的 ADR 中更合适——决策的层级（哪层做出的）与影响面一致。

## Rationale（用户直接阐述的思考）

[用户]：nodes + edges 两张表是架构基石，不应该在每次加搜索能力时被 ALTER。搜索是扩展功能，搜索索引应该也是扩展表。未来可能学日语德语，每次加语言只要多 INSERT 一行，不碰 nodes 的 schema。

另一个想法：ARCHURE + ADR 之间应该有链接——这个 ADR 和 data-model ADR 是父子关系，data-model 说了 nodes 不能动，这个 ADR 说了如何在不碰 nodes 的前提下加搜索能力。两者通过链接关联，不重叠不断裂。

## Alternatives Considered

- **nodes 表加多个 `tsvector` 生成列**：每语言一列，简单但不扩展。4+ 语言后维护成本超过独立表的 JOIN 开销。放弃。
- **search_index 也存 embedding**：概念上统一了"所有搜索字段在一张表"，但 embedding 是节点属性（1:1），独立存储每次查询都要 JOIN——不必要的代价。放弃。

## AI Role

[AI]：对比了 nodes 加生成列 vs 独立表的扩展性差异。论证了 embedding 留在 nodes 表的理由（1:1 关系不需要拆表）。调研了 PG 原生多语言 `tsvector` 的配置方式。确认了 HNSW 索引不随语言增列而受影响。

## Consequences

- ✅ 加新语言不碰 nodes schema，符合 Phase 1 data-model ADR 的约束
- ✅ 中英两套搜索各跑各的，不互相污染
- ✅ GIN 索引独立可重建，不影响节点写入
- ⚠️ 全文搜索多一次 JOIN（search_index JOIN nodes）——数据量小不影响
- ⚠️ 创建/更新节点时，需要同步更新 search_index 中的对应行——落在 worker 或 API handler 中实现
