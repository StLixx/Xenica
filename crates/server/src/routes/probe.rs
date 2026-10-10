//! 探针：一张固定的 PNG，用来验证「本服务给出的公开图片链接能被别的站点直接内嵌」这条链路。
//!
//! 不用登录，`Content-Type` 一定是 `image/png`——在别处（例如对话里让 AI 展示图片）看到这张
//! 写着 `/API/PROBE` 的测试图，就说明链路通了；看到占位符，问题也不在这张图上。
//! 它不碰库，和分享链接（`/api/share/{token}/png`）无关。

use axum::{http::header, response::IntoResponse};

/// 测试图本身（同目录的 `probe.png`，1200x630，由 `scripts/make-probe-png.mjs` 生成）。
const PNG: &[u8] = include_bytes!("probe.png");

/// 返回那张测试图。**不用登录**。
#[utoipa::path(get, path = "/api/probe/png", tag = "probe",
    responses((status = 200, content_type = "image/png", body = Vec<u8>)))]
pub async fn probe_png() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "image/png"),
            // 图是死的，缓存短一点，换图后不至于一直看到旧的。
            (header::CACHE_CONTROL, "public, max-age=60"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        PNG,
    )
}
