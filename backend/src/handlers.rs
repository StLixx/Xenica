use axum::{
    Json,
    extract::{Path, State},
};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::db;
use crate::models::*;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
}

pub async fn create_node(
    State(state): State<AppState>,
    Json(req): Json<CreateNodeRequest>,
) -> Result<Json<Value>, AppError> {
    let node = db::create_node(&state.pool, &req).await?;
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
