//! 分享链接。
//!
//! 两条路，都不用登录：
//! - **给 AI 读**：`GET /api/share/{token}` 返回整理好的文字说明（见 `docs/adr/0009-sketch.md`）。
//! - **给 AI 改**：`PUT /api/share/{token}` 用新画面替换，只有 write 链接可以。
//!
//! 管理（开、看、作废）在 `/api/nodes/{id}/shares` 和 `/api/shares/{id}` 上，要登录。
//! 两处前缀刻意不一样：`share`（公开）和 `shares`（要登录）。

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use utoipa::ToSchema;
use uuid::Uuid;
use xenica_core::{Actor, Node, NodeId, NodePatch, ShareMode, SketchLinks, describe};
use xenica_store::Share;

use crate::{ApiError, AppState, auth::CurrentUser, error::ErrorBody};

/// 一条分享链接（带好可以直接用的地址）。
#[derive(Serialize, ToSchema)]
pub struct ShareBody {
    pub id: Uuid,
    pub node: Uuid,
    pub mode: ShareMode,
    pub token: String,
    /// 交给 AI 的地址：打开就是文字说明；write 链接也用这个地址改画面。
    pub url: String,
    /// 画面图片。
    pub image: String,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize, ToSchema)]
pub struct NewShare {
    /// `read`（给 AI 读）或 `write`（给 AI 改）。
    pub mode: ShareMode,
}

#[derive(Deserialize, ToSchema)]
pub struct SceneInput {
    /// Excalidraw 的画面数据，原样存下来。
    pub scene: Value,
}

/// 请求落在哪个地址上。hikari 和 Traefik 都保留 Host，所以拼得出来。
///
/// 协议按「不是本机就是 https」判断，**不看 `x-forwarded-proto`**：TLS 在 hikari 上就终结了，
/// 再到应用是一段明文 HTTP，那个头会说是 http，拼出来的链接就成了 `http://域名/...`（真机上踩过）。
fn origin(headers: &HeaderMap) -> String {
    let host = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("localhost");
    let local =
        host.starts_with("localhost") || host.starts_with("127.0.0.1") || host.starts_with("[::1]");
    let scheme = if local { "http" } else { "https" };
    format!("{scheme}://{host}")
}

fn view(share: &Share, headers: &HeaderMap) -> ShareBody {
    let base = origin(headers);
    ShareBody {
        id: share.id,
        node: share.node,
        mode: ShareMode::parse(&share.mode).unwrap_or(ShareMode::Read),
        token: share.token.clone(),
        url: format!("{base}/api/share/{}", share.token),
        image: format!("{base}/api/share/{}/png", share.token),
        created_at: share.created_at,
        revoked_at: share.revoked_at,
    }
}

/// 按 token 取出链接和它指向的节点。
async fn load(state: &AppState, token: &str) -> Result<(Share, Node), ApiError> {
    let share = state.store.find_share(token).await?;
    let node = state.store.get_node(NodeId(share.node)).await?;
    Ok((share, node))
}

fn has_image(node: &Node) -> bool {
    node.body.get("image").and_then(Value::as_str).is_some()
}

/// 这个文件是不是这张画面用到的（附件只能看画面里出现的，不能拿 token 到处取文件）。
fn uses_file(node: &Node, file: Uuid) -> bool {
    let wanted = file.to_string();
    if node.body.get("image").and_then(Value::as_str) == Some(wanted.as_str()) {
        return true;
    }
    node.body
        .get("scene")
        .and_then(|s| s.get("elements"))
        .and_then(Value::as_array)
        .is_some_and(|els| {
            els.iter().any(|el| {
                el.get("fileId").and_then(Value::as_str) == Some(wanted.as_str())
                    || el
                        .get("fileIds")
                        .and_then(Value::as_object)
                        .is_some_and(|m| m.contains_key(&wanted))
            })
        })
}

/// 给一个节点开一条分享链接。
#[utoipa::path(post, path = "/api/nodes/{id}/shares", tag = "shares",
    params(("id" = String, Path, format = Uuid)), request_body = NewShare,
    responses((status = 201, body = ShareBody), (status = 404, body = ErrorBody)))]
pub async fn create_share(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<NodeId>,
    headers: HeaderMap,
    Json(input): Json<NewShare>,
) -> Result<(StatusCode, Json<ShareBody>), ApiError> {
    // 节点不存在就直接 404，不给开链接。
    state.store.get_node(id).await?;
    let token = crate::auth::new_share_token();
    let share = state
        .store
        .create_share(&user.actor(), id, input.mode, &token)
        .await?;
    Ok((StatusCode::CREATED, Json(view(&share, &headers))))
}

/// 一个节点上的分享链接（含已作废的）。
#[utoipa::path(get, path = "/api/nodes/{id}/shares", tag = "shares",
    params(("id" = String, Path, format = Uuid)),
    responses((status = 200, body = Vec<ShareBody>)))]
pub async fn list_shares(
    State(state): State<AppState>,
    Path(id): Path<NodeId>,
    headers: HeaderMap,
) -> Result<Json<Vec<ShareBody>>, ApiError> {
    let out = state
        .store
        .list_shares(id)
        .await?
        .iter()
        .map(|s| view(s, &headers))
        .collect();
    Ok(Json(out))
}

/// 作废一条分享链接。
#[utoipa::path(delete, path = "/api/shares/{id}", tag = "shares",
    params(("id" = String, Path, format = Uuid)),
    responses((status = 204), (status = 404, body = ErrorBody)))]
pub async fn revoke_share(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    state.store.revoke_share(&user.actor(), id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// 读一张草图：返回整理好的文字说明。**不用登录**。
#[utoipa::path(get, path = "/api/share/{token}", tag = "shares",
    params(("token" = String, Path)),
    responses((status = 200, content_type = "text/markdown", body = String), (status = 404, body = ErrorBody)))]
pub async fn read_share(
    State(state): State<AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    let (share, node) = load(&state, &token).await?;
    let base = origin(&headers);
    let links = SketchLinks {
        image: has_image(&node).then(|| format!("{base}/api/share/{token}/png")),
        scene: Some(format!("{base}/api/share/{token}/scene.json")),
        node: Some(format!("{base}/sketch/{}", node.id)),
        attachment: Some(format!("{base}/api/share/{token}/files")),
    };
    let scene = node.body.get("scene").cloned().unwrap_or(Value::Null);
    let mut text = describe(&node.title, &scene, &links);
    if ShareMode::parse(&share.mode).map_err(ApiError::from_domain)? == ShareMode::Write {
        text.push_str(&format!(
            "\n这条地址也可以改画面：PUT {base}/api/share/{token}，请求体形如 {{\"scene\": {{…}}}}\n"
        ));
    }
    Ok((
        [(header::CONTENT_TYPE, "text/markdown; charset=utf-8")],
        text,
    ))
}

/// 画布的原始数据。不用登录。
#[utoipa::path(get, path = "/api/share/{token}/scene.json", tag = "shares",
    params(("token" = String, Path)),
    responses((status = 200, body = Value), (status = 404, body = ErrorBody)))]
pub async fn share_scene(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (_share, node) = load(&state, &token).await?;
    Ok(Json(node.body.get("scene").cloned().unwrap_or_else(
        || json!({ "type": "excalidraw", "elements": [] }),
    )))
}

/// 整张图的图片。不用登录。
#[utoipa::path(get, path = "/api/share/{token}/png", tag = "shares",
    params(("token" = String, Path)),
    responses((status = 200, content_type = "image/png", body = Vec<u8>), (status = 404, body = ErrorBody)))]
pub async fn share_image(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let (_share, node) = load(&state, &token).await?;
    let id = node
        .body
        .get("image")
        .and_then(Value::as_str)
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(ApiError::not_found)?;
    let file = state.store.get_file(id).await?;
    Ok((
        [
            (header::CONTENT_TYPE, file.mime),
            (
                header::CACHE_CONTROL,
                "private, max-age=60, must-revalidate".to_owned(),
            ),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_owned()),
        ],
        file.bytes,
    ))
}

/// 画面里用到的附件（原图，不压缩）。不用登录。
#[utoipa::path(get, path = "/api/share/{token}/files/{file}", tag = "shares",
    params(("token" = String, Path), ("file" = String, Path, format = Uuid)),
    responses((status = 200, content_type = "image/*", body = Vec<u8>), (status = 404, body = ErrorBody)))]
pub async fn share_file(
    State(state): State<AppState>,
    Path((token, file)): Path<(String, Uuid)>,
) -> Result<impl IntoResponse, ApiError> {
    let (_share, node) = load(&state, &token).await?;
    if !uses_file(&node, file) {
        return Err(ApiError::not_found());
    }
    let stored = state.store.get_file(file).await?;
    Ok((
        [
            (header::CONTENT_TYPE, stored.mime),
            (
                header::CACHE_CONTROL,
                "private, max-age=31536000, immutable".to_owned(),
            ),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_owned()),
        ],
        stored.bytes,
    ))
}

/// 用新画面替换。**不用登录**，但只有 write 链接可以。
#[utoipa::path(put, path = "/api/share/{token}", tag = "shares",
    params(("token" = String, Path)), request_body = SceneInput,
    responses((status = 200, body = Node), (status = 400, body = ErrorBody),
        (status = 403, body = ErrorBody), (status = 404, body = ErrorBody)))]
pub async fn write_share(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(input): Json<SceneInput>,
) -> Result<Json<Node>, ApiError> {
    let share = state.store.find_share(&token).await?;
    if ShareMode::parse(&share.mode).map_err(ApiError::from_domain)? != ShareMode::Write {
        return Err(ApiError::forbidden("这条链接只能读"));
    }
    if !input.scene.is_object()
        || input
            .scene
            .get("elements")
            .and_then(Value::as_array)
            .is_none()
    {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid",
            "scene 要是 Excalidraw 的画面数据（含 elements）",
        ));
    }
    let node = state.store.get_node(NodeId(share.node)).await?;
    let mut body = match node.body {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    body.insert("scene".to_owned(), input.scene);
    // 画面换了，之前存的那张图就旧了：删掉，免得给出过期的东西。
    body.remove("image");
    let actor = Actor::Processor {
        id: format!("share:{}", share.id),
        version: "1".into(),
    };
    let node = state
        .store
        .update_node(
            &actor,
            NodeId(share.node),
            NodePatch {
                title: None,
                body: Some(Value::Object(body)),
            },
        )
        .await?;
    Ok(Json(node))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers(host: &str, proto: Option<&str>) -> HeaderMap {
        let mut map = HeaderMap::new();
        map.insert(header::HOST, HeaderValue::from_str(host).unwrap());
        if let Some(proto) = proto {
            map.insert("x-forwarded-proto", HeaderValue::from_str(proto).unwrap());
        }
        map
    }

    #[test]
    fn 域名上一律_https() {
        // TLS 在 hikari 上终结，转发过来是明文，那个头会说是 http——不能信它
        assert_eq!(
            origin(&headers("xenica.truebigsand.top", Some("http"))),
            "https://xenica.truebigsand.top"
        );
        assert_eq!(
            origin(&headers("excalidraw.xenica.truebigsand.top", None)),
            "https://excalidraw.xenica.truebigsand.top"
        );
    }

    #[test]
    fn 本机开发用_http() {
        assert_eq!(
            origin(&headers("localhost:5173", None)),
            "http://localhost:5173"
        );
        assert_eq!(
            origin(&headers("127.0.0.1:8080", None)),
            "http://127.0.0.1:8080"
        );
    }
}
