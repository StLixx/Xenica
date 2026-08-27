use axum::{
    Json,
    extract::{Multipart, Path, Query, State},
};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use uuid::Uuid;

use crate::db;
use crate::embedding::SiliconFlowEmbedder;
use crate::import::{ImportContext, ImportInput, default_registry};
use crate::models::*;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub embedder: Arc<SiliconFlowEmbedder>,
}

pub async fn create_node(
    State(state): State<AppState>,
    Json(req): Json<CreateNodeRequest>,
) -> Result<Json<Value>, AppError> {
    let node = db::create_node(&state.pool, &req).await?;
    db::enqueue_embedding_task(&state.pool, node.id).await?;
    Ok(Json(json!({
        "node": node,
        "connection_count": req.connections.len()
    })))
}

pub async fn get_node(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    match db::get_node_detail(&state.pool, id).await? {
        Some(detail) => Ok(Json(json!(detail))),
        None => Err(AppError::NotFound(format!("node {} not found", id))),
    }
}

pub async fn get_neighbors(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let neighbors = db::get_neighbors(&state.pool, id).await?;
    Ok(Json(json!({ "neighbors": neighbors })))
}

pub async fn list_nodes(
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let nodes = db::list_nodes(&state.pool).await?;
    Ok(Json(json!({ "nodes": nodes })))
}

pub async fn list_edges(
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let edges = db::list_edges(&state.pool).await?;
    Ok(Json(json!({ "edges": edges })))
}

pub async fn search_nodes(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Value>, AppError> {
    let results = match query.mode.as_str() {
        "fulltext" => search_fulltext(&state, &query).await?,
        "semantic" => search_semantic_route(&state, &query).await?,
        _ => search_hybrid(&state, &query).await?,
    };

    Ok(Json(json!({ "results": results })))
}

pub async fn import_file(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<Value>, AppError> {
    let upload_dir: PathBuf = std::env::var("IMPORT_UPLOAD_DIR")
        .unwrap_or_else(|_| "./uploads".into())
        .into();
    std::fs::create_dir_all(&upload_dir).map_err(|e| AppError::Internal(anyhow::anyhow!("create upload dir: {}", e)))?;

    let mut saved_path: Option<PathBuf> = None;
    let mut mime_type: Option<String> = None;
    let mut user_notes: Option<String> = None;
    let mut batch_id: Option<Uuid> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("multipart: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                let ct = field.content_type().map(|m| m.to_string());
                let original_name = field.file_name().map(|s| s.to_string());
                let ext = original_name
                    .as_deref()
                    .and_then(|n| std::path::Path::new(n).extension())
                    .and_then(|e| e.to_str())
                    .unwrap_or("bin");
                let saved = upload_dir.join(format!("upload-{}.{}", Uuid::new_v4(), ext));
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::Internal(anyhow::anyhow!("read multipart field: {}", e)))?;
                std::fs::write(&saved, &bytes).map_err(|e| AppError::Internal(anyhow::anyhow!("write upload: {}", e)))?;
                if mime_type.is_none() {
                    mime_type = ct;
                }
                saved_path = Some(saved);
            }
            "mime_type" => {
                let v = field
                    .text()
                    .await
                    .map_err(|e| AppError::Internal(anyhow::anyhow!("read mime_type: {}", e)))?;
                mime_type = Some(v);
            }
            "user_notes" => {
                let v = field
                    .text()
                    .await
                    .map_err(|e| AppError::Internal(anyhow::anyhow!("read user_notes: {}", e)))?;
                if !v.is_empty() {
                    user_notes = Some(v);
                }
            }
            "batch_id" => {
                let v = field
                    .text()
                    .await
                    .map_err(|e| AppError::Internal(anyhow::anyhow!("read batch_id: {}", e)))?;
                if !v.is_empty() {
                    batch_id = Some(Uuid::parse_str(&v).map_err(|e| {
                        AppError::Internal(anyhow::anyhow!("invalid batch_id: {}", e))
                    })?);
                }
            }
            _ => {
                let _ = field.bytes().await;
            }
        }
    }

    let file_path = saved_path.ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing file field")))?;
    let mime_type = mime_type.ok_or_else(|| AppError::Internal(anyhow::anyhow!("missing mime_type field")))?;

    let registry = default_registry();
    let handler = registry.get(&mime_type).ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("unsupported mime type: {}", mime_type))
    })?;

    let ctx = ImportContext {
        pool: state.pool.clone(),
        upload_dir,
    };
    let input = ImportInput {
        file_path,
        mime_type: mime_type.clone(),
        user_notes,
        batch_id,
    };

    let out = handler
        .process(input, &ctx)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("handler failed: {}", e)))?;

    let node_ids = crate::import::write_import_output(&state.pool, out)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("write import output: {}", e)))?;

    Ok(Json(json!({
        "created_node_ids": node_ids,
        "mime_type": mime_type,
        "count": node_ids.len(),
    })))
}

async fn search_fulltext(state: &AppState, query: &SearchQuery) -> Result<Vec<Value>, AppError> {
    let nodes = db::search_fulltext(&state.pool, &query.q, &query.language).await?;
    Ok(nodes.into_iter().map(|n| json!(n)).collect())
}

async fn search_semantic_route(state: &AppState, query: &SearchQuery) -> Result<Vec<Value>, AppError> {
    let embeddings = state.embedder.embed(vec![query.q.clone()]).await?;
    let embedding = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("no embedding returned")))?;

    let scored = db::search_semantic(&state.pool, &embedding).await?;
    Ok(scored.into_iter().map(|s| {
        json!({
            "id": s.id,
            "content": s.content,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
            "score": s.score,
        })
    }).collect())
}

async fn search_hybrid(state: &AppState, query: &SearchQuery) -> Result<Vec<Value>, AppError> {
    let ft_nodes = db::search_fulltext(&state.pool, &query.q, &query.language).await?;

    let embeddings = state.embedder.embed(vec![query.q.clone()]).await?;
    let embedding = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("no embedding returned")))?;
    let semantic_scored = db::search_semantic(&state.pool, &embedding).await?;

    let k: f64 = 60.0;
    let ft_ranks: std::collections::HashMap<Uuid, usize> = ft_nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id, i + 1))
        .collect();
    let sem_ranks: std::collections::HashMap<Uuid, usize> = semantic_scored
        .iter()
        .enumerate()
        .map(|(i, s)| (s.id, i + 1))
        .collect();

    let all_ids: std::collections::HashSet<_> = ft_ranks.keys().chain(sem_ranks.keys()).copied().collect();

    let all_nodes: std::collections::HashMap<Uuid, &db::ScoredNode> = semantic_scored
        .iter()
        .map(|s| (s.id, s))
        .collect();

    let mut fused: Vec<(Uuid, String, f64)> = all_ids
        .into_iter()
        .map(|id| {
            let ft_score = ft_ranks.get(&id).map(|r| 1.0 / (k + *r as f64)).unwrap_or(0.0);
            let sem_score = sem_ranks.get(&id).map(|r| 1.0 / (k + *r as f64)).unwrap_or(0.0);
            let content = all_nodes
                .get(&id)
                .map(|s| s.content.clone())
                .or_else(|| ft_nodes.iter().find(|n| n.id == id).map(|n| n.content.clone()))
                .unwrap_or_default();
            (id, content, ft_score + sem_score)
        })
        .collect();

    fused.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    Ok(fused
        .into_iter()
        .map(|(id, content, score)| {
            json!({
                "id": id,
                "content": content,
                "score": score,
            })
        })
        .collect())
}

pub enum AppError {
    NotFound(String),
    Internal(anyhow::Error),
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e)
    }
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            AppError::NotFound(msg) => (axum::http::StatusCode::NOT_FOUND, msg),
            AppError::Internal(e) => (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                format!("internal error: {}", e),
            ),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
