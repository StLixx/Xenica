mod api;
mod config;
mod db;
mod extraction;
mod llm;

use std::sync::Arc;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};

use tower_http::cors::{Any, CorsLayer};

use api::routes::{self, AppState};
use config::AppConfig;
use db::{connection, schema};
use llm::client::LlmClient;

#[tokio::main]
async fn main() {
    // 初始化日志
    tracing_subscriber::fmt::init();

    // 加载配置
    let config = AppConfig::from_env();
    tracing::info!("Xenica 启动中...");
    tracing::info!("端口: {}", config.port);
    tracing::info!("LLM: {} ({})", config.llm_endpoint, config.llm_model);

    // 初始化 SurrealDB
    let db = connection::init_db(&config)
        .await
        .expect("SurrealDB 初始化失败");

    // 初始化 Schema
    schema::init_schema(&db)
        .await
        .expect("Schema 初始化失败");

    // 初始化 LLM 客户端
    let llm = LlmClient::new(&config);
    tracing::info!("LLM 客户端就绪: 默认模型 {}", llm.default_model());

    // 共享状态
    let state = Arc::new(AppState { db, llm });

    // CORS 配置 — 允许 localhost:3000（前端开发）
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:3000".parse().unwrap(),
        ])
        .allow_methods(Any)
        .allow_headers(Any);

    // 路由
    let app = Router::new()
        .route("/api/health", get(routes::health))
        .route("/api/chat", post(routes::send_chat))
        .route("/api/conversations", post(routes::create_conversation).get(routes::list_conversations))
        .route("/api/conversations/{id}/messages", get(routes::get_conversation_messages))
        .route("/api/moments", post(routes::create_moment).get(routes::list_moments))
        .route("/api/moments/{id}", get(routes::get_moment))
        .route("/api/moments/{id}/related", get(routes::get_related))
        .route("/api/moments/{id}/extract", post(routes::extract_moment_handler))
        .route("/api/conversations/{id}/extract", post(routes::extract_conversation_handler))
        .route("/api/entities", post(routes::create_entity).get(routes::list_entities))
        .route("/api/search", get(routes::search))
        .route("/api/relations", post(routes::create_relation))
        .route("/api/goals", post(routes::create_goal).get(routes::list_goals))
        // X3 图谱查询路由
        .route("/api/graph/traverse/{id}", get(routes::graph_traverse))
        .route("/api/graph/top", get(routes::graph_top))
        .route("/api/graph/stats", get(routes::graph_stats))
        .route("/api/graph/recalculate", post(routes::recalculate_weights))
        .route("/api/perspectives", get(routes::list_perspectives))
        // X6: 间隔重复
        .route("/api/reviews/due", get(routes::list_due_reviews))
        .route("/api/reviews/schedule", post(routes::create_review_schedule))
        .route("/api/reviews/{id}/respond", post(routes::review_respond))
        // X5B: OCR 端点
        .route("/api/ocr", post(routes::ocr_image))
        // X5C: 视频导入
        .route("/api/import/video", post(routes::import_video))
        // 请求体大小限制 10MB（OCR 图片需要）
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(cors)
        .with_state(state);

    // 启动服务
    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("Xenica 已启动: http://localhost:{}", config.port);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("端口绑定失败");

    axum::serve(listener, app)
        .await
        .expect("服务启动失败");
}
