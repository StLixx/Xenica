//! 文件（截图等）。上传后不可变，用 `/api/files/{id}` 引用。

use axum::{
    Json,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{ApiError, AppState, auth::CurrentUser, error::ErrorBody};

/// 单个文件的上限。
pub const MAX_FILE_BYTES: usize = 25 * 1024 * 1024;

#[derive(Serialize, ToSchema)]
pub struct FileRef {
    pub id: Uuid,
    /// 在 Markdown 里引用用的地址，例如 `![](/api/files/…)`。
    pub url: String,
}

/// 上传图片（请求体就是文件本身，`Content-Type` 写图片类型）。内容相同的文件只存一份。
#[utoipa::path(post, path = "/api/files", tag = "files",
    request_body(content = Vec<u8>, content_type = "image/*"),
    responses((status = 201, body = FileRef), (status = 400, body = ErrorBody)))]
pub async fn upload_file(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, Json<FileRef>), ApiError> {
    let mime = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = [
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/avif",
    ];
    if !allowed.contains(&mime.as_str()) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid",
            "只支持 PNG、JPEG、GIF、WebP、AVIF 图片",
        ));
    }
    if body.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid",
            "文件是空的",
        ));
    }
    let sha = format!("{:x}", Sha256::digest(&body));
    let id = state
        .store
        .put_file(&user.actor(), &sha, &mime, &body)
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(FileRef {
            id,
            url: format!("/api/files/{id}"),
        }),
    ))
}

/// 读取文件。
#[utoipa::path(get, path = "/api/files/{id}", tag = "files",
    params(("id" = String, Path, format = Uuid)),
    responses((status = 200, content_type = "image/*", body = Vec<u8>), (status = 404, body = ErrorBody)))]
pub async fn get_file(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let f = state.store.get_file(id).await?;
    Ok((
        [
            (header::CONTENT_TYPE, f.mime),
            (
                header::CACHE_CONTROL,
                "private, max-age=31536000, immutable".to_owned(),
            ),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_owned()),
        ],
        f.bytes,
    ))
}

/// 上传接口需要比默认（2 MB）更大的请求体上限。
pub fn body_limit() -> DefaultBodyLimit {
    DefaultBodyLimit::max(MAX_FILE_BYTES)
}
