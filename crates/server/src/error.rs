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
    /// 机器可读：`invalid`、`unauthorized`（没登录）、`forbidden`、`not_found`、`conflict`、
    /// `locked`（输错太多次）、`internal`。
    pub error: &'static str,
    pub message: String,
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    body: ErrorBody,
}

impl ApiError {
    pub fn new(status: StatusCode, error: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            body: ErrorBody {
                error,
                message: message.into(),
            },
        }
    }

    pub fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", "not found")
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthorized", "请先登录")
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "forbidden", message)
    }

    pub fn locked(message: impl Into<String>) -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, "locked", message)
    }

    pub fn internal() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "internal error",
        )
    }

    pub fn from_domain(err: DomainError) -> Self {
        StoreError::Domain(err).into()
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
