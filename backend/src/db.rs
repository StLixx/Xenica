use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::models::*;

#[derive(Debug, FromRow)]
struct NeighborRow {
    pub node_id: Uuid,
    pub node_content: String,
    pub node_created_at: chrono::DateTime<chrono::Utc>,
    pub node_updated_at: chrono::DateTime<chrono::Utc>,
    pub edge_id: Uuid,
    pub edge_label: String,
    pub direction: String,
}

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    let sql = include_str!("../migrations/0001_init.sql");
    for statement in sql.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(pool).await?;
        }
    }
    Ok(())
}

pub async fn create_node(pool: &PgPool, req: &CreateNodeRequest) -> Result<Node> {
    let mut tx = pool.begin().await?;

    let node = sqlx::query_as::<_, Node>(
        "INSERT INTO nodes (content) VALUES ($1) RETURNING id, content, created_at, updated_at",
    )
    .bind(&req.content)
    .fetch_one(&mut *tx)
    .await?;

    for conn in &req.connections {
        sqlx::query(
            "INSERT INTO edges (source_id, target_id, label) VALUES ($1, $2, $3)",
        )
        .bind(node.id)
        .bind(conn.target_id)
        .bind(&conn.label)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(node)
}

pub async fn get_node(pool: &PgPool, id: Uuid) -> Result<Option<Node>> {
    let node = sqlx::query_as::<_, Node>("SELECT id, content, created_at, updated_at FROM nodes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(node)
}

pub async fn get_neighbors(pool: &PgPool, id: Uuid) -> Result<Vec<NeighborNode>> {
    let rows = sqlx::query_as::<_, NeighborRow>(
        r#"SELECT n.id AS node_id, n.content AS node_content,
                  n.created_at AS node_created_at, n.updated_at AS node_updated_at,
                  e.id AS edge_id, e.label AS edge_label,
                  CASE WHEN e.source_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction
           FROM edges e
           JOIN nodes n ON (e.target_id = n.id AND e.source_id = $1)
                         OR (e.source_id = n.id AND e.target_id = $1)
           WHERE n.id != $1"#,
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let neighbors = rows
        .into_iter()
        .map(|row| NeighborNode {
            node: Node {
                id: row.node_id,
                content: row.node_content,
                created_at: row.node_created_at,
                updated_at: row.node_updated_at,
            },
            edge_id: row.edge_id,
            edge_label: row.edge_label,
            direction: row.direction,
        })
        .collect();

    Ok(neighbors)
}

pub async fn get_node_detail(pool: &PgPool, id: Uuid) -> Result<Option<NodeDetail>> {
    let node = match get_node(pool, id).await? {
        Some(n) => n,
        None => return Ok(None),
    };
    let neighbors = get_neighbors(pool, id).await?;
    Ok(Some(NodeDetail { node, neighbors }))
}

pub async fn list_nodes(pool: &PgPool) -> Result<Vec<Node>> {
    let nodes = sqlx::query_as::<_, Node>(
        "SELECT id, content, created_at, updated_at FROM nodes ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(nodes)
}

pub async fn list_edges(pool: &PgPool) -> Result<Vec<Edge>> {
    let edges = sqlx::query_as::<_, Edge>(
        "SELECT id, source_id, target_id, label, created_at FROM edges ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(edges)
}
