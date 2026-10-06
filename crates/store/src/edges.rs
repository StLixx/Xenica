use chrono::{DateTime, Utc};
use serde_json::json;
use uuid::Uuid;
use xenica_core::{Actor, DomainError, Edge, EdgeId, NewEdge, NodeId};

use crate::{Store, StoreError, trace};

struct EdgeRow {
    id: Uuid,
    source: Uuid,
    target: Uuid,
    kind: String,
    created_at: DateTime<Utc>,
}

impl From<EdgeRow> for Edge {
    fn from(r: EdgeRow) -> Self {
        Edge {
            id: EdgeId(r.id),
            source: NodeId(r.source),
            target: NodeId(r.target),
            kind: r.kind,
            created_at: r.created_at,
        }
    }
}

impl Store {
    /// 给定节点时只返回与它相连的关系；否则返回全部（最多 `limit` 条）。
    pub async fn list_edges(
        &self,
        node: Option<NodeId>,
        limit: i64,
    ) -> Result<Vec<Edge>, StoreError> {
        let rows = sqlx::query_as!(
            EdgeRow,
            r#"select id, source, target, kind, created_at
               from edges
               where $1::uuid is null or source = $1 or target = $1
               order by created_at, id limit $2"#,
            node.map(|n| n.0),
            limit.clamp(1, 5000),
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(Edge::from).collect())
    }

    pub async fn create_edge(&self, actor: &Actor, input: NewEdge) -> Result<Edge, StoreError> {
        let input = input.normalize()?;
        let mut tx = self.pool.begin().await?;
        let edge: Edge = sqlx::query_as!(
            EdgeRow,
            r#"insert into edges (id, source, target, kind) values ($1, $2, $3, $4)
               returning id, source, target, kind, created_at"#,
            EdgeId::new().0,
            input.source.0,
            input.target.0,
            input.kind,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(StoreError::from_db)?
        .into();
        trace(
            &mut tx,
            actor,
            "edge.created",
            edge.id.0,
            json!({ "source": edge.source, "target": edge.target, "kind": edge.kind }),
        )
        .await?;
        tx.commit().await?;
        Ok(edge)
    }

    pub async fn delete_edge(&self, actor: &Actor, id: EdgeId) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query_scalar!("delete from edges where id = $1 returning id", id.0)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(DomainError::NotFound)?;
        trace(&mut tx, actor, "edge.deleted", id.0, json!({})).await?;
        tx.commit().await?;
        Ok(())
    }
}
