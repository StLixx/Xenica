use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use utoipa::ToSchema;
use xenica_core::DomainError;
use xenica_store::StoreError;

/// 所有接口统一的错误格式。
#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorBody {
    /// 机器可读：`invalid`、`not_found`、`conflict`、`internal`。
    pub error: &'static str,
    pub message: String,
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    body: ErrorBody,
}

impl ApiError {
    pub fn not_found() -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            body: ErrorBody {
                error: "not_found",
                message: "not found".into(),
            },
        }
    }
}

impl From<StoreError> for ApiError {
    fn from(err: StoreError) -> Self {
        let (status, error, message) = match err {
            StoreError::Domain(DomainError::Invalid(m)) => (StatusCode::BAD_REQUEST, "invalid", m),
            StoreError::Domain(DomainError::NotFound) => return Self::not_found(),
            StoreError::Conflict(m) => (StatusCode::CONFLICT, "conflict", m),
            other => {
                tracing::error!(error = %other, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "internal error".into(),
                )
            }
        };
        Self {
            status,
            body: ErrorBody { error, message },
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}
