use chrono::{DateTime, Utc};
use serde_json::json;
use uuid::Uuid;
use xenica_core::{Actor, DomainError, NewNode, Node, NodeId, NodePatch};

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
        let input = input.normalize()?;
        let mut tx = self.pool.begin().await?;
        let node: Node = sqlx::query_as!(
            NodeRow,
            r#"insert into nodes (id, kind, title, body) values ($1, $2, $3, $4)
               returning id, kind, title, body, created_at, updated_at"#,
            NodeId::new().0,
            input.kind,
            input.title,
            input.body,
        )
        .fetch_one(&mut *tx)
        .await?
        .into();
        trace(
            &mut tx,
            actor,
            "node.created",
            node.id.0,
            json!({ "kind": node.kind, "title": node.title }),
        )
        .await?;
        tx.commit().await?;
        Ok(node)
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
        tx.commit().await?;
        Ok(node)
    }

    /// 删除节点，连带删除它的关系。痕迹保留。
    pub async fn delete_node(&self, actor: &Actor, id: NodeId) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let title = sqlx::query_scalar!("delete from nodes where id = $1 returning title", id.0)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(DomainError::NotFound)?;
        trace(
            &mut tx,
            actor,
            "node.deleted",
            id.0,
            json!({ "title": title }),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }
}
