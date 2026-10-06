use axum::{Json, extract::State};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{ApiError, AppState};

#[derive(Serialize, ToSchema)]
pub struct Health {
    pub status: &'static str,
    pub version: &'static str,
}

/// 健康检查：数据库可用时返回 200。
#[utoipa::path(get, path = "/api/health", tag = "system",
    responses((status = 200, body = Health), (status = 500, body = crate::error::ErrorBody)))]
pub async fn health(State(state): State<AppState>) -> Result<Json<Health>, ApiError> {
    state.store.ping().await?;
    Ok(Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    }))
}
