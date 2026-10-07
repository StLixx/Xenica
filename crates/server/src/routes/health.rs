use axum::{Json, extract::State};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{ApiError, AppState};

#[derive(Serialize, ToSchema)]
pub struct Health {
    pub status: &'static str,
    pub version: &'static str,
    /// 构建时的 git commit（镜像里由 CI 写入 `XENICA_COMMIT`），本地开发时为空。
    pub commit: Option<String>,
}

/// 健康检查：数据库可用时返回 200（#4 验收冒烟，可整 PR 回退）。
#[utoipa::path(get, path = "/api/health", tag = "system",
    responses((status = 200, body = Health), (status = 500, body = crate::error::ErrorBody)))]
pub async fn health(State(state): State<AppState>) -> Result<Json<Health>, ApiError> {
    state.store.ping().await?;
    Ok(Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        commit: std::env::var("XENICA_COMMIT")
            .ok()
            .filter(|c| !c.is_empty()),
    }))
}
