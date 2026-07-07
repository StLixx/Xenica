use anyhow::Result;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::db;
use crate::embedding::SiliconFlowEmbedder;

pub fn start_worker(pool: PgPool, embedder: Arc<SiliconFlowEmbedder>) {
    tokio::spawn(async move {
        loop {
            let result = process_tasks(&pool, &embedder).await;
            if let Err(e) = result {
                eprintln!("Worker error: {}", e);
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
    });
}

async fn process_tasks(pool: &PgPool, embedder: &SiliconFlowEmbedder) -> Result<()> {
    let tasks = db::fetch_pending_tasks(pool).await?;

    for task in tasks {
        db::claim_task(pool, task.id).await?;

        let result = match task.task_type.as_str() {
            "generate_embedding" => process_embedding(pool, embedder, &task).await,
            _ => {
                Err(anyhow::anyhow!("unknown task type: {}", task.task_type))
            }
        };

        match result {
            Ok(()) => {
                db::complete_task(pool, task.id).await?;
            }
            Err(e) => {
                let error_msg = format!("{}", e);
                if task.attempts + 1 >= task.max_attempts {
                    db::dead_letter_task(pool, task.id, &error_msg).await?;
                } else {
                    db::retry_task(pool, task.id, &error_msg).await?;
                }
            }
        }
    }
    Ok(())
}

async fn process_embedding(
    pool: &PgPool,
    embedder: &SiliconFlowEmbedder,
    task: &crate::models::Task,
) -> Result<()> {
    let node_id: Uuid = task
        .payload
        .get("node_id")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| anyhow::anyhow!("missing node_id in payload"))?;

    let node = db::get_node(pool, node_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("node {} not found", node_id))?;

    let embeddings = embedder.embed(vec![node.content]).await?;
    let embedding = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("no embedding returned"))?;

    db::update_node_embedding(pool, node_id, &embedding).await?;
    Ok(())
}
