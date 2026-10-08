//! 节点接口——加新接口时以这个文件为范例。

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use utoipa::IntoParams;
use xenica_core::{NewChildren, NewNode, Node, NodeId, NodePatch, Trace};

use crate::{ApiError, AppState, auth::CurrentUser, error::ErrorBody};

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ListParams {
    /// 最多返回多少条，默认 200，上限 1000。
    pub limit: Option<i64>,
}

/// 列出节点（最近更新的在前）。
#[utoipa::path(get, path = "/api/nodes", tag = "nodes", params(ListParams),
    responses((status = 200, body = Vec<Node>)))]
pub async fn list_nodes(
    State(state): State<AppState>,
    Query(p): Query<ListParams>,
) -> Result<Json<Vec<Node>>, ApiError> {
    Ok(Json(state.store.list_nodes(p.limit.unwrap_or(200)).await?))
}

/// 新建节点。
#[utoipa::path(post, path = "/api/nodes", tag = "nodes", request_body = NewNode,
    responses((status = 201, body = Node), (status = 400, body = ErrorBody)))]
pub async fn create_node(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(input): Json<NewNode>,
) -> Result<(StatusCode, Json<Node>), ApiError> {
    let node = state.store.create_node(&user.actor(), input).await?;
    Ok((StatusCode::CREATED, Json(node)))
}

/// 读取一个节点。
#[utoipa::path(get, path = "/api/nodes/{id}", tag = "nodes",
    params(("id" = String, Path, format = Uuid)),
    responses((status = 200, body = Node), (status = 404, body = ErrorBody)))]
pub async fn get_node(
    State(state): State<AppState>,
    Path(id): Path<NodeId>,
) -> Result<Json<Node>, ApiError> {
    Ok(Json(state.store.get_node(id).await?))
}

/// 修改节点（只改给出的字段）。
#[utoipa::path(patch, path = "/api/nodes/{id}", tag = "nodes",
    params(("id" = String, Path, format = Uuid)), request_body = NodePatch,
    responses((status = 200, body = Node), (status = 400, body = ErrorBody), (status = 404, body = ErrorBody)))]
pub async fn update_node(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<NodeId>,
    Json(patch): Json<NodePatch>,
) -> Result<Json<Node>, ApiError> {
    Ok(Json(
        state.store.update_node(&user.actor(), id, patch).await?,
    ))
}

/// 删除节点及其关系。痕迹保留。
#[utoipa::path(delete, path = "/api/nodes/{id}", tag = "nodes",
    params(("id" = String, Path, format = Uuid)),
    responses((status = 204), (status = 404, body = ErrorBody)))]
pub async fn delete_node(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<NodeId>,
) -> Result<StatusCode, ApiError> {
    state.store.delete_node(&user.actor(), id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// 节点的痕迹（谁、何时、做了什么）。
#[utoipa::path(get, path = "/api/nodes/{id}/traces", tag = "nodes",
    params(("id" = String, Path, format = Uuid)),
    responses((status = 200, body = Vec<Trace>)))]
pub async fn list_node_traces(
    State(state): State<AppState>,
    Path(id): Path<NodeId>,
) -> Result<Json<Vec<Trace>>, ApiError> {
    Ok(Json(state.store.list_traces(id.0).await?))
}

/// 按顺序列出子节点（一页里的各块）。
#[utoipa::path(get, path = "/api/nodes/{id}/children", tag = "nodes",
    params(("id" = String, Path, format = Uuid)),
    responses((status = 200, body = Vec<Node>)))]
pub async fn list_children(
    State(state): State<AppState>,
    Path(id): Path<NodeId>,
) -> Result<Json<Vec<Node>>, ApiError> {
    Ok(Json(state.store.list_children(id).await?))
}

/// 在指定位置插入一个或多个新的子节点，返回新建的节点。
#[utoipa::path(post, path = "/api/nodes/{id}/children", tag = "nodes",
    params(("id" = String, Path, format = Uuid)), request_body = NewChildren,
    responses((status = 201, body = Vec<Node>), (status = 400, body = ErrorBody), (status = 404, body = ErrorBody)))]
pub async fn create_children(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<NodeId>,
    Json(input): Json<NewChildren>,
) -> Result<(StatusCode, Json<Vec<Node>>), ApiError> {
    let nodes = state
        .store
        .create_children(&user.actor(), id, input)
        .await?;
    Ok((StatusCode::CREATED, Json(nodes)))
}

/// 重排子节点：给出现有子节点的新顺序。
#[utoipa::path(put, path = "/api/nodes/{id}/children", tag = "nodes",
    params(("id" = String, Path, format = Uuid)), request_body = Vec<String>,
    responses((status = 204), (status = 404, body = ErrorBody), (status = 409, body = ErrorBody)))]
pub async fn reorder_children(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<NodeId>,
    Json(ids): Json<Vec<NodeId>>,
) -> Result<StatusCode, ApiError> {
    state.store.reorder_children(&user.actor(), id, ids).await?;
    Ok(StatusCode::NO_CONTENT)
}
