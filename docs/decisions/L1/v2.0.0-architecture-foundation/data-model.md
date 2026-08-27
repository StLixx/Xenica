## ADR / L1 / architecture-foundation / 数据模型：nodes + edges 两张表

**状态**: accepted
**日期**: 2026-07-06
**来源 thread**: architecture-foundation

## Context

Phase 1 需要支撑三个场景：S1（知识录入与连接）、S7（聚焦式节点探索）、S6（知识图谱导航）。这三个场景的数据形状天然是"节点之间通过有标签的边连接"——一段文本连到另一个概念、一个节点查看所有邻居、所有节点的网状概览。关系型数据库的经典方案是"加一张单独的属性表存 key-value"，但在图数据场景下这既不自然也无必要。

旧探索 thread 中已对数据模型有过初步讨论（`backend/design/01-data-model.md`），本 ADR 将其正式化并追溯至具体场景。

## Decision

### 两张表，没有第三张

```sql
CREATE TABLE nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
```

### What

- 所有信息实体都是 `nodes` 中的一行。文本内容放在 `content`（TEXT），不做结构化列拆分
- 所有关系都是 `edges` 中的一行。`label` 是自由文本，不做枚举约束
- 不做第三张属性表。属性（"已完成"、"2026-07-04"、"物理"）也是节点，通过边关联到目标节点

### Why（追溯到场景）

- **S1 驱动了两张表**：存入一段文本（→ `nodes` 表）+ 指定它连到哪些已有节点（→ `edges` 表）。两张表刚好够，多一张是多余的
- **S7 驱动了边索引**：查一个节点的一层邻居需要 `WHERE source_id = ? OR target_id = ?`，两个方向的索引确保这个查询不超过一次 JOIN
- **边 label 自由文本**：S1 中用户当场决定"这段教材内容 connected_to 那个概念"还是"这段教材内容 derived_from 那个概念"，无法预设枚举。高频标签在 Phase 2 自然涌现后再考虑标准化，Phase 1 不做约束
- **content 纯 TEXT**：S1 的输入就是一段自然语言文本。Phase 1 不做结构化拆分（作者、日期、标签等各自成列），因为缺少属性的列 = 少一张表的 JOIN，数据量小时更简单直接

### What was avoided

- **属性表（properties 表）**：不建。这违反了 Genesis 的"属性即节点"理念——"已完成"作为一个节点，将来可以有自己的 outgoing 边（已完成的事项产生新的回响 = S9）。一张属性表封死了这个可能性
- **硬类型列**：不在 `nodes` 上加 `type` 列。Phase 1 所有节点平等，"教材段落"和"个人想法"和"概念"的区别通过边关系表达。S8（跨格式同一性）会催生类型的自然涌现，但不应该在 Phase 1 预测
- **软删除**：不建 `deleted_at` 列。Phase 1 先做真删除。S9（完成事项的回响）和 S4（代码追溯）未来可能催生版本需求，届时再引入

## Rationale（用户直接阐述的思考）

[用户]：之前在探索 thread 里定了数据模型方向（两张表 + 属性即节点），但那时候是按主题分而不是按场景推。现在从 S1/S7/S6 出发，每张表每一列都能回答"为什么要这个"——追溯到具体的用户场景，而不是抽象的架构讨论。属性即节点的核心直觉来自 Genesis 的"完成事项产生新回响"——不把状态锁死在布尔值里。

## Alternatives Considered

- **三表方案（nodes + properties + edges）**：经典关系型做法，属性存 key-value。放弃原因：(1) 违背属性即节点理念，(2) S7 的邻居查询会多一层 JOIN，(3) 属性不能作为边的起点或终点
- **PostgreSQL JSONB 属性列**：在 nodes 上加一个 JSONB 列存属性。放弃原因：JSONB 里的键值不能被其他节点通过边引用，"已完成"不能有自己的 outgoing 边
- **硬类型（nodes.type ENUM）**：放弃原因：Phase 1 不需要，未来的类型边界也应该是不断演化的，ENUM 改起来成本高

## AI Role

[AI]：从 Genesis 提炼的 S1/S7/S6 场景出发，推到图数据模型的自然选择——两张表的 SQL 恰好能表达这三个场景的数据流。分析了旧探索 thread 中 `backend/design/01-data-model.md` 的讨论并纳入 ADR。论证了 `label` 自由文本、`content` 纯 TEXT、不做第三张表的三项取舍及其对应的场景依据。

## Consequences

- ✅ 两张表极其简单，migration 一次完成，不会在 Phase 1 有 schema 变更
- ✅ 边索引覆盖了 S7（邻居查询）的核心读路径
- ✅ 属性即节点保留了"完成事项产生回响"的可能性——S9 的后门
- ⚠️ 属性全量取要多次 JOIN——Phase 1 数据量小不影响，规模变大后需要缓存或物化视图（Phase 2 处理）
- ⚠️ 没有类型列意味着 S6 的全量展示是"一片节点没有分类"——但这也是 Phase 1 的真实状态：先用，类型从使用中涌现

## 跨 thread 关联

- **搜索扩展**：Phase 2 的全文搜索索引新增了独立表 `search_index`，不修改 nodes 和 edges 的 schema。详见 [core-capabilities 的 search-index ADR](../core-capabilities/search-index.md)。
- **数据模型不变承诺**：本 ADR 承诺的两张表结构在 core-capabilities 中保持不变，所有扩展（向量列、搜索索引）均通过新增独立表或加列到 existing 表完成。
