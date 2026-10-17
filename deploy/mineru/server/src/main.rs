mod normalize;
mod provider;
use anyhow::{Context, Result, bail};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{HeaderMap, Request, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use provider::Provider;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use std::{
    collections::HashMap,
    path::{Path as FsPath, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::io::AsyncWriteExt;
use tower::ServiceExt;
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;
const MAX_FILE: u64 = 200 * 1024 * 1024;
const COOKIE: &str = "__Host-mineru";
#[derive(Clone)]
struct App {
    pool: PgPool,
    data: PathBuf,
    public: String,
    provider: Provider,
    http: reqwest::Client,
}
type Shared = Arc<App>;
struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
impl From<sqlx::Error> for ApiError {
    fn from(_: sqlx::Error) -> Self {
        Self(
            StatusCode::SERVICE_UNAVAILABLE,
            "存储暂不可用，请稍后重试".into(),
        )
    }
}
impl From<std::io::Error> for ApiError {
    fn from(_: std::io::Error) -> Self {
        Self(StatusCode::INTERNAL_SERVER_ERROR, "文件读取失败".into())
    }
}
fn bad(message: &str) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, message.into())
}
fn not_found() -> ApiError {
    ApiError(StatusCode::NOT_FOUND, "文档不存在".into())
}
fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
fn cookie_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| part.trim().strip_prefix("__Host-mineru="))
}
async fn current(app: &App, headers: &HeaderMap) -> std::result::Result<String, ApiError> {
    let token = cookie_token(headers)
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "请先登录".into()))?;
    if token.len() > 200 {
        return Err(ApiError(StatusCode::UNAUTHORIZED, "登录已过期".into()));
    }
    sqlx::query_scalar::<_, String>(
        "SELECT owner FROM mineru_sessions WHERE hash=$1 AND expires>now()",
    )
    .bind(token_hash(token))
    .fetch_optional(&app.pool)
    .await?
    .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "登录已过期，请重新登录".into()))
}
fn same_origin(app: &App, headers: &HeaderMap) -> std::result::Result<(), ApiError> {
    if headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) != Some(app.public.as_str()) {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "请求来源无效，请刷新页面".into(),
        ));
    }
    Ok(())
}
#[derive(Deserialize)]
struct Login {
    #[serde(alias = "name")]
    username: String,
    password: String,
}
async fn login(
    State(app): State<Shared>,
    headers: HeaderMap,
    Json(data): Json<Login>,
) -> std::result::Result<Response, ApiError> {
    same_origin(&app, &headers)?;
    if data.username != "test" || data.password.is_empty() || data.password.len() > 4096 {
        return Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "用户名或密码不对".into(),
        ));
    }
    let response = app
        .http
        .post("http://100.100.1.103:8080/api/auth/login")
        .header("Host", "excalidraw.xenica.truebigsand.top")
        .json(&json!({"name":data.username,"password":data.password}))
        .send()
        .await
        .map_err(|_| ApiError(StatusCode::BAD_GATEWAY, "登录服务暂不可用".into()))?;
    if !response.status().is_success() {
        let status = if response.status().as_u16() == 429 {
            StatusCode::TOO_MANY_REQUESTS
        } else {
            StatusCode::UNAUTHORIZED
        };
        return Err(ApiError(
            status,
            if status == StatusCode::TOO_MANY_REQUESTS {
                "尝试次数较多，请稍后重试"
            } else {
                "用户名或密码不对"
            }
            .into(),
        ));
    }
    let user: Value = response
        .json()
        .await
        .map_err(|_| ApiError(StatusCode::BAD_GATEWAY, "登录服务响应无效".into()))?;
    let owner = user["id"]
        .as_str()
        .filter(|id| !id.is_empty() && id.len() <= 256)
        .ok_or_else(|| ApiError(StatusCode::BAD_GATEWAY, "登录身份无效".into()))?;
    if user["name"] != "test" {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "账号不可用于此工作区".into(),
        ));
    }
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    sqlx::query("DELETE FROM mineru_sessions WHERE expires<now()")
        .execute(&app.pool)
        .await?;
    sqlx::query("INSERT INTO mineru_sessions(hash,owner,name,expires) VALUES($1,$2,'test',now()+interval '14 days')").bind(token_hash(&token)).bind(owner).execute(&app.pool).await?;
    let cookie =
        format!("{COOKIE}={token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=1209600");
    Ok((
        [(header::SET_COOKIE, cookie)],
        Json(json!({"user":{"id":owner,"name":"test"}})),
    )
        .into_response())
}
async fn logout(
    State(app): State<Shared>,
    headers: HeaderMap,
) -> std::result::Result<Response, ApiError> {
    same_origin(&app, &headers)?;
    if let Some(token) = cookie_token(&headers) {
        sqlx::query("DELETE FROM mineru_sessions WHERE hash=$1")
            .bind(token_hash(token))
            .execute(&app.pool)
            .await?;
    }
    Ok((
        [(
            header::SET_COOKIE,
            format!("{COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0"),
        )],
        Json(json!({"ok":true})),
    )
        .into_response())
}
async fn me(
    State(app): State<Shared>,
    headers: HeaderMap,
) -> std::result::Result<Json<Value>, ApiError> {
    let owner = current(&app, &headers).await?;
    Ok(Json(
        json!({"id":owner,"name":"test","user":{"id":owner,"name":"test"}}),
    ))
}
fn metadata(row: &sqlx::postgres::PgRow) -> Value {
    json!({"id":row.get::<Uuid,_>("id"),"name":row.get::<String,_>("name"),"size":row.get::<i64,_>("size"),"status":row.get::<String,_>("status"),
        "error":row.get::<Option<String>,_>("error"),"pages":row.get::<i32,_>("pages"),"favorite":row.get::<bool,_>("favorite"),
        "created_at":row.get::<DateTime<Utc>,_>("created_at"),"updated_at":row.get::<DateTime<Utc>,_>("updated_at"),
        "reading":row.get::<Value,_>("reading"),"settings":row.get::<Value,_>("settings"),"progress":row.get::<Value,_>("provider").get("progress")})
}
async fn list(
    State(app): State<Shared>,
    headers: HeaderMap,
) -> std::result::Result<Json<Value>, ApiError> {
    let owner = current(&app, &headers).await?;
    let rows =
        sqlx::query("SELECT id,name,size,status,error,pages,favorite,created_at,updated_at,reading,settings,provider FROM mineru_documents WHERE owner=$1 ORDER BY created_at DESC")
            .bind(owner)
            .fetch_all(&app.pool)
            .await?;
    Ok(Json(Value::Array(rows.iter().map(metadata).collect())))
}
async fn owned(
    app: &App,
    owner: &str,
    id: Uuid,
) -> std::result::Result<sqlx::postgres::PgRow, ApiError> {
    sqlx::query("SELECT * FROM mineru_documents WHERE id=$1 AND owner=$2")
        .bind(id)
        .bind(owner)
        .fetch_optional(&app.pool)
        .await?
        .ok_or_else(not_found)
}
async fn document(
    State(app): State<Shared>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> std::result::Result<Json<Value>, ApiError> {
    let owner = current(&app, &headers).await?;
    let row = owned(&app, &owner, id).await?;
    let mut value = metadata(&row);
    let result = row.get::<Value, _>("result");
    if let Some(object) = result.as_object() {
        for (key, item) in object {
            value[key] = item.clone();
        }
    }
    if value.get("blocks").is_none() {
        value["blocks"] = json!([]);
        value["markdown"] = json!("");
    }
    let favorites = sqlx::query_scalar::<_, String>(
        "SELECT block_id FROM mineru_block_favorites WHERE document_id=$1",
    )
    .bind(id)
    .fetch_all(&app.pool)
    .await?;
    if let Some(blocks) = value["blocks"].as_array_mut() {
        for block in blocks {
            block["favorite"] = json!(
                block["id"]
                    .as_str()
                    .is_some_and(|id| favorites.iter().any(|v| v == id))
            );
        }
    }
    Ok(Json(value))
}
fn bool_setting(value: &str) -> std::result::Result<bool, ApiError> {
    match value {
        "true" | "1" | "on" => Ok(true),
        "false" | "0" | "off" => Ok(false),
        _ => Err(bad("解析参数无效")),
    }
}
async fn upload(
    State(app): State<Shared>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> std::result::Result<Json<Value>, ApiError> {
    same_origin(&app, &headers)?;
    let owner = current(&app, &headers).await?;
    if !app.provider.configured() {
        return Err(ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "解析服务尚未配置".into(),
        ));
    }
    let queued=sqlx::query_scalar::<_,i64>("SELECT count(*) FROM mineru_documents WHERE status IN ('queued','uploading','processing','downloading')").fetch_one(&app.pool).await?;
    if queued >= 30 {
        return Err(ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "解析队列较忙，请稍后重试".into(),
        ));
    }
    let id = Uuid::now_v7();
    let dir = app.data.join(id.to_string());
    tokio::fs::create_dir_all(&dir).await?;
    let mut name = None;
    let mut size = 0_u64;
    let mut settings =
        json!({"model":"vlm","ocr":false,"formula":true,"table":true,"language":"ch"});
    let result: std::result::Result<(), ApiError> = async {
        while let Some(mut field) = multipart
            .next_field()
            .await
            .map_err(|_| bad("上传表单无效"))?
        {
            let key = field.name().unwrap_or("").to_owned();
            if key == "file" {
                if name.is_some() {
                    return Err(bad("每次请选择一个 PDF 文件"));
                }
                let filename = field
                    .file_name()
                    .unwrap_or("文档.pdf")
                    .chars()
                    .filter(|c| !c.is_control() && *c != '/' && *c != '\\')
                    .take(240)
                    .collect::<String>();
                if !filename.to_lowercase().ends_with(".pdf") {
                    return Err(bad("目前支持 PDF 文件"));
                }
                let mut file = tokio::fs::File::create(dir.join("original.partial")).await?;
                let mut magic = Vec::new();
                while let Some(chunk) = field.chunk().await.map_err(|_| bad("文件上传中断"))?
                {
                    size += chunk.len() as u64;
                    if size > MAX_FILE {
                        return Err(ApiError(
                            StatusCode::PAYLOAD_TOO_LARGE,
                            "文件不能超过 200 MB".into(),
                        ));
                    }
                    if magic.len() < 1024 {
                        magic.extend_from_slice(&chunk[..chunk.len().min(1024 - magic.len())]);
                    }
                    file.write_all(&chunk).await?;
                }
                if size < 5 || !magic.windows(5).any(|v| v == b"%PDF-") {
                    return Err(bad("文件内容不是有效的 PDF"));
                }
                file.sync_all().await?;
                drop(file);
                tokio::fs::rename(dir.join("original.partial"), dir.join("original.pdf")).await?;
                name = Some(if filename.is_empty() {
                    "文档.pdf".into()
                } else {
                    filename
                });
            } else {
                let mut bytes = Vec::new();
                while let Some(chunk) = field.chunk().await.map_err(|_| bad("解析参数无效"))?
                {
                    if bytes.len() + chunk.len() > 128 {
                        return Err(bad("解析参数过长"));
                    }
                    bytes.extend_from_slice(&chunk);
                }
                let text = String::from_utf8(bytes).map_err(|_| bad("解析参数无效"))?;
                match key.as_str() {
                    "model" => {
                        if !matches!(text.as_str(), "vlm" | "pipeline") {
                            return Err(bad("模型参数无效"));
                        }
                        settings[key] = json!(text);
                    }
                    "ocr" | "formula" | "table" => settings[key] = json!(bool_setting(&text)?),
                    "language" => {
                        if !text.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
                            || text.is_empty()
                        {
                            return Err(bad("识别语言无效"));
                        }
                        settings[key] = json!(text);
                    }
                    _ => {}
                }
            }
        }
        if name.is_none() {
            return Err(bad("请选择 PDF 文件"));
        }
        Ok(())
    }
    .await;
    if let Err(error) = result {
        let _ = tokio::fs::remove_dir_all(&dir).await;
        return Err(error);
    }
    if let Err(error) = sqlx::query(
        "INSERT INTO mineru_documents(id,owner,name,size,settings) VALUES($1,$2,$3,$4,$5)",
    )
    .bind(id)
    .bind(&owner)
    .bind(name.unwrap_or_default())
    .bind(size as i64)
    .bind(settings)
    .execute(&app.pool)
    .await
    {
        let _ = tokio::fs::remove_dir_all(&dir).await;
        return Err(error.into());
    }
    Ok(Json(metadata(&owned(&app, &owner, id).await?)))
}

#[derive(Deserialize)]
struct PatchDocument {
    favorite: Option<bool>,
    reading: Option<Value>,
}
async fn update_document(
    State(app): State<Shared>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(change): Json<PatchDocument>,
) -> std::result::Result<Json<Value>, ApiError> {
    same_origin(&app, &headers)?;
    let owner = current(&app, &headers).await?;
    let row = owned(&app, &owner, id).await?;
    if let Some(reading) = &change.reading {
        let page = reading["page"]
            .as_i64()
            .ok_or_else(|| bad("阅读页码无效"))?;
        let pages = row.get::<i32, _>("pages");
        if page < 0 || (pages > 0 && page >= pages as i64) {
            return Err(bad("阅读页码越界"));
        }
        let zoom = reading["zoom"].as_f64().unwrap_or(1.0);
        if !zoom.is_finite() || !(0.2..=5.0).contains(&zoom) {
            return Err(bad("缩放比例无效"));
        }
        if reading.get("selected_id").is_some_and(|v| {
            !v.is_null() && (!v.is_string() || v.as_str().is_some_and(|s| s.len() > 200))
        }) {
            return Err(bad("所选块无效"));
        }
        sqlx::query("UPDATE mineru_documents SET reading=$2,updated_at=now() WHERE id=$1")
            .bind(id)
            .bind(reading)
            .execute(&app.pool)
            .await?;
    }
    if let Some(favorite) = change.favorite {
        sqlx::query("UPDATE mineru_documents SET favorite=$2,updated_at=now() WHERE id=$1")
            .bind(id)
            .bind(favorite)
            .execute(&app.pool)
            .await?;
    }
    Ok(Json(metadata(&owned(&app, &owner, id).await?)))
}
#[derive(Deserialize)]
struct Favorite {
    favorite: bool,
}
async fn block_favorite(
    State(app): State<Shared>,
    headers: HeaderMap,
    Path((id, block_id)): Path<(Uuid, String)>,
    Json(change): Json<Favorite>,
) -> std::result::Result<Json<Value>, ApiError> {
    same_origin(&app, &headers)?;
    let owner = current(&app, &headers).await?;
    let row = owned(&app, &owner, id).await?;
    let result: Value = row.get("result");
    if !result["blocks"]
        .as_array()
        .is_some_and(|items| items.iter().any(|v| v["id"] == block_id))
    {
        return Err(not_found());
    }
    if change.favorite {
        sqlx::query("INSERT INTO mineru_block_favorites(document_id,block_id) VALUES($1,$2) ON CONFLICT DO NOTHING").bind(id).bind(&block_id).execute(&app.pool).await?;
    } else {
        sqlx::query("DELETE FROM mineru_block_favorites WHERE document_id=$1 AND block_id=$2")
            .bind(id)
            .bind(&block_id)
            .execute(&app.pool)
            .await?;
    }
    Ok(Json(json!({"favorite":change.favorite,"id":block_id})))
}
async fn favorites(
    State(app): State<Shared>,
    headers: HeaderMap,
) -> std::result::Result<Json<Value>, ApiError> {
    let owner = current(&app, &headers).await?;
    let rows = sqlx::query(
        "SELECT * FROM mineru_documents WHERE owner=$1 AND favorite=true ORDER BY updated_at DESC",
    )
    .bind(&owner)
    .fetch_all(&app.pool)
    .await?;
    let favs=sqlx::query("SELECT f.document_id,f.block_id,d.name,d.result FROM mineru_block_favorites f JOIN mineru_documents d ON d.id=f.document_id WHERE d.owner=$1 ORDER BY f.created_at DESC").bind(owner).fetch_all(&app.pool).await?;
    let blocks=favs.iter().filter_map(|row|{
        let result:Value=row.get("result");let block_id:String=row.get("block_id");
        result["blocks"].as_array()?.iter().find(|b|b["id"]==block_id).map(|b|json!({"document_id":row.get::<Uuid,_>("document_id"),"document_name":row.get::<String,_>("name"),"block":b}))
    }).collect::<Vec<_>>();
    Ok(Json(
        json!({"documents":rows.iter().map(metadata).collect::<Vec<_>>(),"blocks":blocks}),
    ))
}
async fn original(
    State(app): State<Shared>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    request: Request<axum::body::Body>,
) -> std::result::Result<Response, ApiError> {
    let owner = current(&app, &headers).await?;
    owned(&app, &owner, id).await?;
    serve(
        app.data.join(id.to_string()).join("original.pdf"),
        request,
        false,
    )
    .await
}
async fn asset(
    State(app): State<Shared>,
    headers: HeaderMap,
    Path((id, path)): Path<(Uuid, String)>,
    request: Request<axum::body::Body>,
) -> std::result::Result<Response, ApiError> {
    let owner = current(&app, &headers).await?;
    owned(&app, &owner, id).await?;
    if path.is_empty()
        || path.contains('\\')
        || path.chars().any(char::is_control)
        || FsPath::new(&path)
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err(not_found());
    }
    let root = tokio::fs::canonicalize(app.data.join(id.to_string()).join("bundle"))
        .await
        .map_err(|_| not_found())?;
    let target = tokio::fs::canonicalize(root.join(path))
        .await
        .map_err(|_| not_found())?;
    if !target.starts_with(&root) || !target.is_file() {
        return Err(not_found());
    }
    serve(target, request, false).await
}
async fn serve(
    path: PathBuf,
    request: Request<axum::body::Body>,
    attachment: bool,
) -> std::result::Result<Response, ApiError> {
    let mut response = ServeFile::new(path)
        .oneshot(request)
        .await
        .map_err(|_| ApiError(StatusCode::INTERNAL_SERVER_ERROR, "文件服务暂不可用".into()))?
        .into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("private, no-store"),
    );
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        header::HeaderValue::from_static("nosniff"),
    );
    response.headers_mut().insert(
        header::CONTENT_SECURITY_POLICY,
        header::HeaderValue::from_static(
            "sandbox; default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'",
        ),
    );
    if attachment {
        response.headers_mut().insert(
            header::CONTENT_DISPOSITION,
            header::HeaderValue::from_static("attachment; filename=\"mineru-result.zip\""),
        );
    }
    Ok(response)
}
async fn export(
    State(app): State<Shared>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Query(params): Query<HashMap<String, String>>,
    request: Request<axum::body::Body>,
) -> std::result::Result<Response, ApiError> {
    let owner = current(&app, &headers).await?;
    let row = owned(&app, &owner, id).await?;
    if row.get::<String, _>("status") != "done" {
        return Err(bad("解析完成后才能导出"));
    }
    let result: Value = row.get("result");
    match params
        .get("format")
        .map(String::as_str)
        .unwrap_or("markdown")
    {
        "zip" => {
            serve(
                app.data.join(id.to_string()).join("result.zip"),
                request,
                true,
            )
            .await
        }
        "markdown" => Ok((
            [
                (header::CONTENT_TYPE, "text/markdown; charset=utf-8"),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"result.md\"",
                ),
                (header::CACHE_CONTROL, "private, no-store"),
            ],
            result["markdown"].as_str().unwrap_or("").to_owned(),
        )
            .into_response()),
        "json" => Ok((
            [
                (header::CONTENT_TYPE, "application/json; charset=utf-8"),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"result.json\"",
                ),
                (header::CACHE_CONTROL, "private, no-store"),
            ],
            serde_json::to_string_pretty(&result).unwrap_or_default(),
        )
            .into_response()),
        _ => Err(bad("导出格式无效")),
    }
}
async fn provider_status(
    State(app): State<Shared>,
    headers: HeaderMap,
) -> std::result::Result<Json<Value>, ApiError> {
    current(&app, &headers).await?;
    Ok(Json(
        json!({"configured":app.provider.configured(),"mode":"desktop-api","base":app.provider.base,"version":app.provider.version,"max_file_bytes":MAX_FILE,"concurrency":1,"quota":null}),
    ))
}
async fn health(State(app): State<Shared>) -> std::result::Result<Json<Value>, ApiError> {
    sqlx::query("SELECT 1").execute(&app.pool).await?;
    Ok(Json(
        json!({"ok":true,"service":"mineru","provider_configured":app.provider.configured()}),
    ))
}
async fn progress(app: &App, id: Uuid, status: &str, provider: &Value) -> Result<()> {
    sqlx::query(
        "UPDATE mineru_documents SET status=$2,provider=$3,error=NULL,updated_at=now() WHERE id=$1",
    )
    .bind(id)
    .bind(status)
    .bind(provider)
    .execute(&app.pool)
    .await?;
    Ok(())
}
async fn run_document(app: &App, row: sqlx::postgres::PgRow) -> Result<()> {
    let id: Uuid = row.get("id");
    let name: String = row.get("name");
    let settings: Value = row.get("settings");
    let mut stored: Value = row.get("provider");
    let dir = app.data.join(id.to_string());
    let status: String = row.get("status");
    let batch = if let Some(batch) = stored["batch_id"].as_str() {
        batch.to_owned()
    } else {
        let created = app
            .provider
            .create(&id.to_string(), &name, &settings)
            .await?;
        let batch = created["data"]["batch_id"]
            .as_str()
            .context("missing batch id")?
            .to_owned();
        stored = json!({"batch_id":batch,"created":created});
        progress(app, id, "uploading", &stored).await?;
        batch
    };
    if status != "processing" && status != "downloading" {
        app.provider
            .upload(&stored["created"], &dir.join("original.pdf"))
            .await?;
        progress(app, id, "processing", &stored).await?;
    }
    let start = std::time::Instant::now();
    let mut consecutive_errors = 0;
    loop {
        if start.elapsed() > Duration::from_secs(3600) {
            bail!("provider processing timeout");
        }
        let report = match app.provider.poll(&batch).await {
            Ok(report) => {
                consecutive_errors = 0;
                report
            }
            Err(error) => {
                consecutive_errors += 1;
                if consecutive_errors >= 3 {
                    return Err(error);
                }
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        };
        let results = report["data"]["extract_result"]
            .as_array()
            .context("missing extract result")?;
        let item = results
            .iter()
            .find(|item| item["data_id"] == id.to_string())
            .or_else(|| results.first())
            .context("empty extract result")?;
        let state = item["state"].as_str().unwrap_or("unknown");
        stored["progress"] = item.get("extract_progress").cloned().unwrap_or(Value::Null);
        stored["state"] = json!(state);
        if state == "done" {
            let url = item["full_zip_url"]
                .as_str()
                .context("missing bundle URL")?;
            progress(app, id, "downloading", &stored).await?;
            app.provider.download(url, &dir.join("result.zip")).await?;
            let workdir = dir.clone();
            let normalized = tokio::task::spawn_blocking(move || {
                normalize::unpack(&workdir.join("result.zip"), &workdir.join("bundle"))?;
                normalize::normalize(&workdir.join("bundle"))
            })
            .await??;
            tokio::fs::write(
                dir.join("normalized.json"),
                serde_json::to_vec(&normalized)?,
            )
            .await?;
            let pages = normalized["pages"].as_i64().unwrap_or(0) as i32;
            stored["progress"] = json!({"completed":true});
            sqlx::query("UPDATE mineru_documents SET status='done',pages=$2,result=$3,provider=$4,error=NULL,updated_at=now() WHERE id=$1").bind(id).bind(pages).bind(normalized).bind(stored).execute(&app.pool).await?;
            return Ok(());
        }
        if matches!(state, "failed" | "aborted" | "quota-exceeded" | "expire") {
            bail!("provider terminal state {state}");
        }
        progress(app, id, "processing", &stored).await?;
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}
async fn worker(app: Shared) {
    loop {
        match sqlx::query("SELECT * FROM mineru_documents WHERE status IN ('queued','uploading','processing','downloading') ORDER BY created_at LIMIT 1").fetch_optional(&app.pool).await {
            Ok(Some(row))=>{let id:Uuid=row.get("id");if let Err(error)=run_document(&app,row).await {
                let category=error.to_string();
                let message=if category.contains("401") || category.contains("403") {"解析服务凭据已失效，请联系管理员后重试"}else if category.contains("quota") {"解析服务额度不足，请稍后重试"}else if category.contains("timeout") {"解析超时，请稍后重新上传"}else{"解析失败，请稍后重试；原始文件已保留"};
                eprintln!("document {id} processing failed");
                let _=sqlx::query("UPDATE mineru_documents SET status='failed',error=$2,updated_at=now() WHERE id=$1").bind(id).bind(message).execute(&app.pool).await;
            }},
            Ok(None)=>tokio::time::sleep(Duration::from_secs(2)).await,
            Err(_)=>tokio::time::sleep(Duration::from_secs(5)).await
        }
    }
}
#[tokio::main]
async fn main() {
    if let Err(error) = start().await {
        eprintln!("MinerU startup failed: {}", error);
        std::process::exit(1);
    }
}
async fn start() -> Result<()> {
    if std::env::args().nth(1).as_deref() == Some("normalize") {
        let source = PathBuf::from(
            std::env::args()
                .nth(2)
                .context("bundle directory required")?,
        );
        let target = PathBuf::from(std::env::args().nth(3).context("output path required")?);
        let normalized = normalize::normalize(&source)?;
        tokio::fs::write(target, serde_json::to_vec(&normalized)?).await?;
        return Ok(());
    }
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&std::env::var("DATABASE_URL").context("DATABASE_URL required")?)
        .await
        .context("database connection unavailable")?;
    sqlx::migrate!("../migrations")
        .run(&pool)
        .await
        .context("database migrations failed")?;
    let data = PathBuf::from(
        std::env::var("MINERU_DATA_ROOT")
            .unwrap_or_else(|_| "/mnt/HDD/xenica-private/mineru".into()),
    );
    tokio::fs::create_dir_all(&data).await?;
    let public = std::env::var("MINERU_PUBLIC_URL")
        .unwrap_or_else(|_| "https://mineru.truebigsand.top".into());
    let app = Arc::new(App {
        pool,
        data,
        public,
        provider: Provider::new().context("provider configuration invalid")?,
        http: reqwest::Client::builder()
            .timeout(Duration::from_secs(18))
            .build()?,
    });
    tokio::spawn(worker(app.clone()));
    let web = std::env::var("MINERU_WEB_ROOT").unwrap_or_else(|_| "../web".into());
    let router = Router::new()
        .route("/healthz", get(health))
        .route("/api/health", get(health))
        .route("/api/login", post(login))
        .route("/api/logout", post(logout))
        .route("/api/me", get(me))
        .route("/api/provider/status", get(provider_status))
        .route("/api/documents", get(list).post(upload))
        .route("/api/documents/{id}", get(document).patch(update_document))
        .route("/api/documents/{id}/original", get(original))
        .route("/api/documents/{id}/assets/{*path}", get(asset))
        .route("/api/documents/{id}/export", get(export))
        .route(
            "/api/documents/{id}/blocks/{block_id}/favorite",
            post(block_favorite),
        )
        .route("/api/favorites", get(favorites))
        .route(
            "/api/{*path}",
            get(|| async { (StatusCode::NOT_FOUND, Json(json!({"error":"接口不存在"}))) }),
        )
        .fallback_service(
            ServeDir::new(&web)
                .not_found_service(ServeFile::new(FsPath::new(&web).join("index.html"))),
        )
        .layer(DefaultBodyLimit::max((MAX_FILE + 1024 * 1024) as usize))
        .with_state(app);
    let bind = std::env::var("MINERU_BIND").unwrap_or_else(|_| "127.0.0.1:3056".into());
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    eprintln!("MinerU Web listening on {bind}");
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
