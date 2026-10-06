use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use utoipa::IntoParams;
use xenica_core::{Actor, Edge, EdgeId, NewEdge, NodeId};

use crate::{ApiError, AppState, error::ErrorBody};

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct EdgeParams {
    /// 只返回与这个节点相连的关系。
    pub node: Option<NodeId>,
    /// 默认 2000，上限 5000。
    pub limit: Option<i64>,
}

/// 列出关系。
#[utoipa::path(get, path = "/api/edges", tag = "edges", params(EdgeParams),
    responses((status = 200, body = Vec<Edge>)))]
pub async fn list_edges(
    State(state): State<AppState>,
    Query(p): Query<EdgeParams>,
) -> Result<Json<Vec<Edge>>, ApiError> {
    Ok(Json(
        state
            .store
            .list_edges(p.node, p.limit.unwrap_or(2000))
            .await?,
    ))
}

/// 新建关系。
#[utoipa::path(post, path = "/api/edges", tag = "edges", request_body = NewEdge,
    responses((status = 201, body = Edge), (status = 400, body = ErrorBody),
              (status = 404, body = ErrorBody), (status = 409, body = ErrorBody)))]
pub async fn create_edge(
    State(state): State<AppState>,
    Json(input): Json<NewEdge>,
) -> Result<(StatusCode, Json<Edge>), ApiError> {
    let edge = state.store.create_edge(&Actor::User, input).await?;
    Ok((StatusCode::CREATED, Json(edge)))
}

/// 删除关系。
#[utoipa::path(delete, path = "/api/edges/{id}", tag = "edges",
    params(("id" = String, Path, format = Uuid)),
    responses((status = 204), (status = 404, body = ErrorBody)))]
pub async fn delete_edge(
    State(state): State<AppState>,
    Path(id): Path<EdgeId>,
) -> Result<StatusCode, ApiError> {
    state.store.delete_edge(&Actor::User, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
