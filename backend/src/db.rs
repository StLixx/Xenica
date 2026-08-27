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

#[derive(Debug, FromRow)]
pub struct ScoredNode {
    pub id: Uuid,
    pub content: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub score: Option<f64>,
}

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    let migrations = [
        include_str!("../migrations/0001_init.sql"),
        include_str!("../migrations/0002_infrastructure.sql"),
        include_str!("../migrations/0003_tasks.sql"),
    ];
    for sql in migrations {
        for statement in sql.split(';') {
            let trimmed = statement.trim();
            if !trimmed.is_empty() {
                sqlx::query(trimmed).execute(pool).await?;
            }
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

    sqlx::query(
        "INSERT INTO search_index (node_id, language, fts_vector) VALUES ($1, 'zh', to_tsvector('zh_cn', $2)), ($1, 'en', to_tsvector('english', $2))",
    )
    .bind(node.id)
    .bind(&req.content)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(node)
}

pub async fn enqueue_embedding_task(pool: &PgPool, node_id: Uuid) -> Result<()> {
    sqlx::query(
        "INSERT INTO tasks (task_type, payload) VALUES ('generate_embedding', $1)",
    )
    .bind(serde_json::json!({ "node_id": node_id }))
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_node(pool: &PgPool, id: Uuid) -> Result<Option<Node>> {
    let node = sqlx::query_as::<_, Node>(
        "SELECT id, content, created_at, updated_at FROM nodes WHERE id = $1",
    )
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

pub async fn search_fulltext(pool: &PgPool, query: &str, language: &str) -> Result<Vec<Node>> {
    let ts_config = if language == "en" { "english" } else { "zh_cn" };

    let sql = format!(
        "SELECT n.id, n.content, n.created_at, n.updated_at
         FROM nodes n
         JOIN search_index si ON si.node_id = n.id
         WHERE si.language = $1 AND si.fts_vector @@ plainto_tsquery('{}', $2)
         ORDER BY ts_rank(si.fts_vector, plainto_tsquery('{}', $2)) DESC
         LIMIT 20",
        ts_config, ts_config
    );

    let nodes = sqlx::query_as::<_, Node>(&sql)
        .bind(language)
        .bind(query)
        .fetch_all(pool)
        .await?;

    Ok(nodes)
}

pub async fn search_semantic(pool: &PgPool, query_embedding: &[f32]) -> Result<Vec<ScoredNode>> {
    let embedding_str = format!(
        "[{}]",
        query_embedding
            .iter()
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(",")
    );

    let nodes = sqlx::query_as::<_, ScoredNode>(
        "SELECT id, content, created_at, updated_at,
                1.0 - (embedding <=> $1::vector) AS score
         FROM nodes
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 20",
    )
    .bind(&embedding_str)
    .fetch_all(pool)
    .await?;

    Ok(nodes)
}

pub async fn fetch_pending_tasks(pool: &PgPool) -> Result<Vec<Task>> {
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT id, task_type, payload, status, attempts, max_attempts,
                next_execution_at, error_details, created_at, updated_at
         FROM tasks
         WHERE status = 'pending' AND next_execution_at <= now()
         ORDER BY created_at
         LIMIT 5
         FOR UPDATE SKIP LOCKED",
    )
    .fetch_all(pool)
    .await?;

    Ok(tasks)
}

pub async fn claim_task(pool: &PgPool, task_id: Uuid) -> Result<()> {
    sqlx::query(
        "UPDATE tasks SET status = 'running', attempts = attempts + 1, updated_at = now() WHERE id = $1",
    )
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn complete_task(pool: &PgPool, task_id: Uuid) -> Result<()> {
    sqlx::query(
        "UPDATE tasks SET status = 'done', updated_at = now() WHERE id = $1",
    )
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn retry_task(pool: &PgPool, task_id: Uuid, error: &str) -> Result<()> {
    sqlx::query(
        "UPDATE tasks SET status = 'pending', error_details = $2,
                next_execution_at = now() + interval '1 second' * power(2, attempts),
                updated_at = now()
         WHERE id = $1",
    )
    .bind(task_id)
    .bind(error)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn dead_letter_task(pool: &PgPool, task_id: Uuid, error: &str) -> Result<()> {
    sqlx::query(
        "UPDATE tasks SET status = 'dead_lettered', error_details = $2, updated_at = now() WHERE id = $1",
    )
    .bind(task_id)
    .bind(error)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_node_embedding(pool: &PgPool, node_id: Uuid, embedding: &[f32]) -> Result<()> {
    let embedding_str = format!(
        "[{}]",
        embedding
            .iter()
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(",")
    );

    sqlx::query("UPDATE nodes SET embedding = $1::vector, updated_at = now() WHERE id = $2")
        .bind(&embedding_str)
        .bind(node_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn insert_node_raw(pool: &PgPool, content: &str) -> Result<Uuid> {
    let mut tx = pool.begin().await?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO nodes (content) VALUES ($1) RETURNING id",
    )
    .bind(content)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO search_index (node_id, language, fts_vector) VALUES ($1, 'zh', to_tsvector('zh_cn', $2)), ($1, 'en', to_tsvector('english', $2))",
    )
    .bind(id.0)
    .bind(content)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(id.0)
}

pub async fn insert_edge_raw(pool: &PgPool, source_id: Uuid, target_id: Uuid, label: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO edges (source_id, target_id, label) VALUES ($1, $2, $3)",
    )
    .bind(source_id)
    .bind(target_id)
    .bind(label)
    .execute(pool)
    .await?;
    Ok(())
}
