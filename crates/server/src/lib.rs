//! Xenica HTTP 服务。
//!
//! 加一组接口的做法（照 `routes/nodes.rs` 抄）：
//! 1. 在 `routes/` 新建文件，handler 上写 `#[utoipa::path]`。
//! 2. 在 `api_router()` 里 `.routes(routes!(...))` 注册。
//! 3. 重新生成前端类型：`cargo run -p xenica-server -- openapi > web/src/api/openapi.json`，
//!    再 `pnpm -C web api`。CI 会检查有没有漏。

pub mod auth;
pub mod config;
mod error;
mod routes;
pub mod seed;

use std::{path::Path, sync::Arc};

use axum::{Router, http::StatusCode, middleware};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use utoipa::OpenApi;
use utoipa_axum::{router::OpenApiRouter, routes};
use xenica_store::Store;

pub use auth::Auth;
pub use error::ApiError;

#[derive(Clone)]
pub struct AppState {
    pub store: Store,
    pub auth: Arc<Auth>,
}

impl AppState {
    /// 库里还没有账号时生成一次性设置码（`auth.setup_code()`），由调用方打印到日志。
    pub async fn new(store: Store, demo: bool) -> Result<Self, xenica_store::StoreError> {
        let code = (store.count_users().await? == 0).then(auth::new_setup_code);
        Ok(Self {
            store,
            auth: Arc::new(Auth::new(code, demo)),
        })
    }
}

#[derive(OpenApi)]
#[openapi(info(
    title = "Xenica API",
    description = "Xenica 的 HTTP 接口。由代码生成，不要手改。除 `/api/health`、`/api/auth/*`、`/api/share/*` 和 `/api/probe/*` 外都要先登录（Cookie `xenica_session`）。"
))]
struct ApiDoc;

fn api_router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(routes::health::health))
        .routes(routes!(routes::auth::session))
        .routes(routes!(routes::auth::login))
        .routes(routes!(routes::auth::setup))
        .routes(routes!(routes::auth::logout))
        .routes(routes!(
            routes::nodes::list_nodes,
            routes::nodes::create_node
        ))
        .routes(routes!(
            routes::nodes::get_node,
            routes::nodes::update_node,
            routes::nodes::delete_node
        ))
        .routes(routes!(routes::nodes::list_node_traces))
        .routes(routes!(
            routes::nodes::list_children,
            routes::nodes::create_children,
            routes::nodes::reorder_children
        ))
        .routes(routes!(routes::files::upload_file))
        .routes(routes!(routes::files::get_file))
        .routes(routes!(
            routes::shares::create_share,
            routes::shares::list_shares
        ))
        .routes(routes!(routes::shares::revoke_share))
        .routes(routes!(
            routes::shares::read_share,
            routes::shares::write_share
        ))
        .routes(routes!(routes::shares::share_scene))
        .routes(routes!(routes::shares::share_image))
        .routes(routes!(routes::shares::share_file))
        .routes(routes!(routes::probe::probe_png))
        .routes(routes!(
            routes::edges::list_edges,
            routes::edges::create_edge
        ))
        .routes(routes!(routes::edges::delete_edge))
}

/// 完整的 OpenAPI 文档（`xenica openapi` 会打印它）。
pub fn openapi() -> utoipa::openapi::OpenApi {
    api_router().into_openapi()
}

/// 构建整个应用。`web_dist` 存在时托管前端，其余路径回落到 `index.html`。
/// 鉴权中间件只包住 `/api`；静态文件不需要登录。
pub fn app(state: AppState, web_dist: Option<&Path>) -> Router {
    let (api, _) = api_router().split_for_parts();
    let api = api
        .route(
            "/api/{*rest}",
            axum::routing::any(|| async { ApiError::not_found() }),
        )
        .layer(middleware::from_fn_with_state(state.clone(), auth::guard))
        .layer(routes::files::body_limit())
        .with_state(state);
    let router = match web_dist {
        Some(dir) => api
            .fallback_service(ServeDir::new(dir).fallback(ServeFile::new(dir.join("index.html")))),
        None => api.fallback(|| async { (StatusCode::NOT_FOUND, "web assets not built") }),
    };
    router.layer(TraceLayer::new_for_http())
}
