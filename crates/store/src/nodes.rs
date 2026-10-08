use chrono::{DateTime, Utc};
use serde_json::json;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;
use xenica_core::{
    Actor, CONTAINS, DomainError, EdgeId, MENTIONS, NewChildren, NewNode, Node, NodeId, NodePatch,
    extract_refs, md,
};

use crate::{Store, StoreError, trace};

/// 数据库行。core 不依赖 sqlx，所以在这里转换。
struct NodeRow {
    id: Uuid,
    kind: String,
    title: String,
    body: serde_json::Value,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<NodeRow> for Node {
    fn from(r: NodeRow) -> Self {
        Node {
            id: NodeId(r.id),
            kind: r.kind,
            title: r.title,
            body: r.body,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

impl Store {
    /// 最近更新的节点在前。
    pub async fn list_nodes(&self, limit: i64) -> Result<Vec<Node>, StoreError> {
        let rows = sqlx::query_as!(
            NodeRow,
            r#"select id, kind, title, body, created_at, updated_at
               from nodes order by updated_at desc, id desc limit $1"#,
            limit.clamp(1, 1000),
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(Node::from).collect())
    }

    pub async fn get_node(&self, id: NodeId) -> Result<Node, StoreError> {
        sqlx::query_as!(
            NodeRow,
            r#"select id, kind, title, body, created_at, updated_at
               from nodes where id = $1"#,
            id.0,
        )
        .fetch_optional(&self.pool)
        .await?
        .map(Node::from)
        .ok_or(DomainError::NotFound.into())
    }

    pub async fn create_node(&self, actor: &Actor, input: NewNode) -> Result<Node, StoreError> {
        let mut tx = self.pool.begin().await?;
        let node = insert_node(&mut tx, actor, input, None).await?;
        tx.commit().await?;
        Ok(node)
    }

    /// 按顺序列出子节点（「包含」关系）。
    pub async fn list_children(&self, id: NodeId) -> Result<Vec<Node>, StoreError> {
        let rows = sqlx::query_as!(
            NodeRow,
            r#"select n.id, n.kind, n.title, n.body, n.created_at, n.updated_at
               from edges e join nodes n on n.id = e.target
               where e.source = $1 and e.kind = 'contains'
               order by e.pos nulls last, e.created_at, e.id"#,
            id.0,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(Node::from).collect())
    }

    /// 在 `parent` 里插入一批新节点，返回它们（顺序同输入）。
    pub async fn create_children(
        &self,
        actor: &Actor,
        parent: NodeId,
        input: NewChildren,
    ) -> Result<Vec<Node>, StoreError> {
        if input.nodes.is_empty() || input.nodes.len() > NewChildren::MAX {
            return Err(DomainError::Invalid(format!(
                "nodes must contain 1-{} items",
                NewChildren::MAX
            ))
            .into());
        }
        let mut tx = self.pool.begin().await?;
        let mut order = child_ids(&mut tx, parent).await?;
        let at = input
            .index
            .map_or(order.len(), |i| (i as usize).min(order.len()));
        let mut created = Vec::with_capacity(input.nodes.len());
        for n in input.nodes {
            created.push(insert_node(&mut tx, actor, n, Some(parent)).await?);
        }
        order.splice(at..at, created.iter().map(|n| n.id.0));
        write_order(&mut tx, parent, &order).await?;
        tx.commit().await?;
        Ok(created)
    }

    /// 重排子节点。`ids` 必须正好是现有子节点换个顺序。
    pub async fn reorder_children(
        &self,
        actor: &Actor,
        parent: NodeId,
        ids: Vec<NodeId>,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let current = child_ids(&mut tx, parent).await?;
        let mut a: Vec<Uuid> = ids.iter().map(|i| i.0).collect();
        let mut b = current.clone();
        a.sort();
        b.sort();
        if a != b {
            return Err(StoreError::Conflict(
                "children changed; reload and try again".into(),
            ));
        }
        let order: Vec<Uuid> = ids.iter().map(|i| i.0).collect();
        write_order(&mut tx, parent, &order).await?;
        trace(&mut tx, actor, "node.reordered", parent.0, json!({})).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn update_node(
        &self,
        actor: &Actor,
        id: NodeId,
        patch: NodePatch,
    ) -> Result<Node, StoreError> {
        let patch = patch.normalize()?;
        let mut tx = self.pool.begin().await?;
        let node: Node = sqlx::query_as!(
            NodeRow,
            r#"update nodes set title = coalesce($2, title), body = coalesce($3, body), updated_at = now()
               where id = $1
               returning id, kind, title, body, created_at, updated_at"#,
            id.0,
            patch.title,
            patch.body,
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(DomainError::NotFound)?
        .into();
        trace(
            &mut tx,
            actor,
            "node.updated",
            id.0,
            json!({ "title": patch.title, "body_changed": patch.body.is_some() }),
        )
        .await?;
        if patch.body.is_some() {
            sync_mentions(&mut tx, actor, &node).await?;
        }
        tx.commit().await?;
        Ok(node)
    }

    /// 删除节点和它包含的所有子孙节点，连带删除它们的关系。痕迹保留。
    pub async fn delete_node(&self, actor: &Actor, id: NodeId) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let deleted = sqlx::query!(
            r#"with recursive d(id) as (
                   select $1::uuid
                   union
                   select e.target from edges e join d on e.source = d.id where e.kind = 'contains'
               )
               delete from nodes where id in (select id from d) returning id, title"#,
            id.0,
        )
        .fetch_all(&mut *tx)
        .await?;
        if !deleted.iter().any(|r| r.id == id.0) {
            return Err(DomainError::NotFound.into());
        }
        for r in deleted {
            trace(
                &mut tx,
                actor,
                "node.deleted",
                r.id,
                json!({ "title": r.title, "with": (r.id != id.0).then_some(id.0) }),
            )
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
}

async fn insert_node(
    tx: &mut Transaction<'_, Postgres>,
    actor: &Actor,
    input: NewNode,
    parent: Option<NodeId>,
) -> Result<Node, StoreError> {
    let input = input.normalize()?;
    let node: Node = sqlx::query_as!(
        NodeRow,
        r#"insert into nodes (id, kind, title, body) values ($1, $2, $3, $4)
           returning id, kind, title, body, created_at, updated_at"#,
        input.id.unwrap_or_else(NodeId::new).0,
        input.kind,
        input.title,
        input.body,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(StoreError::from_db)?
    .into();
    trace(
        tx,
        actor,
        "node.created",
        node.id.0,
        json!({ "kind": node.kind, "title": node.title, "parent": parent }),
    )
    .await?;
    sync_mentions(tx, actor, &node).await?;
    Ok(node)
}

async fn child_ids(
    tx: &mut Transaction<'_, Postgres>,
    parent: NodeId,
) -> Result<Vec<Uuid>, StoreError> {
    let exists = sqlx::query_scalar!("select id from nodes where id = $1 for update", parent.0)
        .fetch_optional(&mut **tx)
        .await?;
    if exists.is_none() {
        return Err(DomainError::NotFound.into());
    }
    Ok(sqlx::query_scalar!(
        r#"select target from edges where source = $1 and kind = 'contains'
           order by pos nulls last, created_at, id"#,
        parent.0,
    )
    .fetch_all(&mut **tx)
    .await?)
}

/// 把 `order` 写成父节点的「包含」关系顺序；缺的关系补上。
async fn write_order(
    tx: &mut Transaction<'_, Postgres>,
    parent: NodeId,
    order: &[Uuid],
) -> Result<(), StoreError> {
    let ids: Vec<Uuid> = order.iter().map(|_| EdgeId::new().0).collect();
    let pos: Vec<i32> = (0..order.len() as i32).collect();
    sqlx::query!(
        r#"insert into edges (id, source, target, kind, pos)
           select i, $1, t, $4, p from unnest($2::uuid[], $3::uuid[], $5::int[]) as x(i, t, p)
           on conflict (source, target, kind) do update set pos = excluded.pos"#,
        parent.0,
        &ids,
        order,
        CONTAINS,
        &pos,
    )
    .execute(&mut **tx)
    .await
    .map_err(StoreError::from_db)?;
    Ok(())
}

/// 让「提到」关系和正文一致：正文里的 `#标记`、`[[名字]]` 连到同名节点，没有就新建。
async fn sync_mentions(
    tx: &mut Transaction<'_, Postgres>,
    actor: &Actor,
    node: &Node,
) -> Result<(), StoreError> {
    let names = md(&node.body).map(extract_refs).unwrap_or_default();
    let mut targets = Vec::with_capacity(names.len());
    for name in names {
        let found = sqlx::query_scalar!(
            r#"select id from nodes where title = $1 and id <> $2
               order by created_at, id limit 1"#,
            name,
            node.id.0,
        )
        .fetch_optional(&mut **tx)
        .await?;
        let id = match found {
            Some(id) => id,
            None => {
                let created = Box::pin(insert_node(
                    tx,
                    actor,
                    NewNode {
                        id: None,
                        kind: None,
                        title: name,
                        body: None,
                    },
                    None,
                ))
                .await?;
                created.id.0
            }
        };
        targets.push(id);
    }
    sqlx::query!(
        r#"delete from edges where source = $1 and kind = $2 and not (target = any($3))"#,
        node.id.0,
        MENTIONS,
        &targets,
    )
    .execute(&mut **tx)
    .await?;
    let ids: Vec<Uuid> = targets.iter().map(|_| EdgeId::new().0).collect();
    sqlx::query!(
        r#"insert into edges (id, source, target, kind)
           select i, $1, t, $4 from unnest($2::uuid[], $3::uuid[]) as x(i, t)
           on conflict do nothing"#,
        node.id.0,
        &ids,
        &targets,
        MENTIONS,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}
