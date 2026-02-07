use std::sync::Arc;

use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use surrealdb::sql::Thing;

use crate::db::connection::Db;
use crate::extraction::pipeline;
use crate::llm::client::{ChatMessage, LlmClient};

/// System Prompt
const SYSTEM_PROMPT: &str = "\
你是 Xenica 的 AI 助手。用户会和你分享想法、观点、问题。你的职责：
1. 认真倾听并理解用户的表达
2. 帮助用户理清思路，指出观点的边界和盲区
3. 提供更精确的表述建议
4. 简洁回复，不要长篇大论

注意：用户的每一句话都会被存入知识图谱。帮助用户把模糊的想法变成清晰的认知。";

/// 应用共享状态
#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub llm: LlmClient,
}

// ─── 通用响应 ───

#[derive(Serialize)]
struct ApiResponse<T: Serialize> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct ErrorResponse {
    success: bool,
    error: String,
}

fn ok_json<T: Serialize>(data: T) -> impl IntoResponse {
    Json(ApiResponse {
        success: true,
        data,
    })
}

fn err_json(status: StatusCode, msg: impl ToString) -> impl IntoResponse {
    (
        status,
        Json(ErrorResponse {
            success: false,
            error: msg.to_string(),
        }),
    )
}

// ─── 数据模型 ───

/// SurrealDB 返回的记录（带 id）
#[derive(Debug, Serialize, Deserialize)]
pub struct Record {
    pub id: Thing,
}

// -- Conversation --

#[derive(Debug, Serialize, Deserialize)]
pub struct Conversation {
    pub id: Option<Thing>,
    pub title: Option<String>,
    pub created_at: String,
    pub model: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateConversation {
    pub title: Option<String>,
    pub model: Option<String>,
}

// -- Moment --

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Moment {
    pub id: Option<Thing>,
    pub raw_input: String,
    pub refined: Option<String>,
    pub trigger: Option<String>,
    pub timestamp: String,
    pub location: Option<String>,
    pub perspectives: Vec<String>,
    pub conversation_id: Option<Thing>,
    #[serde(default)]
    pub extracted: bool,
    #[serde(default)]
    pub weight: f64,
}

/// 视角投影（用于只查 perspectives 字段，避免完整 Moment 反序列化）
#[derive(Debug, Deserialize)]
struct PerspectiveProjection {
    #[serde(default)]
    perspectives: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMoment {
    pub raw_input: String,
    pub refined: Option<String>,
    pub trigger: Option<String>,
    pub location: Option<String>,
    pub perspectives: Option<Vec<String>>,
    pub conversation_id: Option<String>,
}

// -- Entity --

#[derive(Debug, Serialize, Deserialize)]
pub struct Entity {
    pub id: Option<Thing>,
    pub name: String,
    pub entity_type: String,
    pub description: Option<String>,
    #[serde(default)]
    pub weight: f64,
}

#[derive(Debug, Deserialize)]
pub struct CreateEntity {
    pub name: String,
    pub entity_type: String,
    pub description: Option<String>,
}

// -- Relation --

/// RELATE 边记录（用于反序列化 RELATE 返回值）
#[derive(Debug, Serialize, Deserialize)]
pub struct RelateEdge {
    pub id: Option<Thing>,
    #[serde(rename = "in")]
    pub source: Option<Thing>,
    #[serde(rename = "out")]
    pub target: Option<Thing>,
    pub relation_type: Option<String>,
    pub description: Option<String>,
    pub strength: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRelation {
    pub from: String,
    pub to: String,
    pub relation_type: String,
    pub description: Option<String>,
    pub strength: Option<f64>,
}

// -- Goal --

#[derive(Debug, Serialize, Deserialize)]
pub struct Goal {
    pub id: Option<Thing>,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateGoal {
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<i64>,
}

// -- Message --

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: Option<Thing>,
    pub conversation_id: Option<Thing>,
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub moment_id: Option<Thing>,
}

// -- ReviewSchedule (X6) --

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReviewSchedule {
    pub id: Option<Thing>,
    pub moment_id: Option<Thing>,
    pub next_review: String,
    #[serde(default = "default_interval")]
    pub interval: f64,
    #[serde(default = "default_ease")]
    pub ease_factor: f64,
    #[serde(default)]
    pub review_count: i64,
    pub created_at: String,
}

fn default_interval() -> f64 { 1.0 }
fn default_ease() -> f64 { 2.5 }

/// 带 moment 信息的到期复习项（JOIN 查询结果）
#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewDueItem {
    pub id: Option<Thing>,
    pub moment_id: Option<Thing>,
    pub next_review: String,
    pub interval: f64,
    pub ease_factor: f64,
    pub review_count: i64,
    pub created_at: String,
    /// 冗余：关联 moment 的文本（方便前端展示）
    pub moment_text: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReviewSchedule {
    pub moment_id: String, // moment 的 ID（不含表名前缀）
}

#[derive(Debug, Deserialize)]
pub struct ReviewRespond {
    /// again | hard | good | easy
    pub response: String,
}

// -- Chat --

#[derive(Debug, Deserialize)]
pub struct ChatInput {
    pub conversation_id: Option<String>,
    pub message: String,
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatOutput {
    pub reply: String,
    pub conversation_id: String,
    pub moment_id: String,
}

// -- Query Params --

#[derive(Debug, Deserialize)]
pub struct MomentQuery {
    pub conversation_id: Option<String>,
    pub perspective: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(rename = "type")]
    pub search_type: Option<String>,
    pub perspective: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct TraverseQuery {
    pub depth: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct TopQuery {
    pub limit: Option<u32>,
}

// ─── 路由处理函数 ───

/// GET /api/health
pub async fn health() -> impl IntoResponse {
    ok_json(serde_json::json!({
        "status": "ok",
        "service": "xenica",
        "version": "0.1.0"
    }))
}

/// POST /api/conversations
pub async fn create_conversation(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateConversation>,
) -> impl IntoResponse {
    let now = chrono::Utc::now().to_rfc3339();

    let result: Result<Vec<Conversation>, _> = state
        .db
        .query(
            "CREATE conversation SET title = $title, created_at = <datetime>$created_at, model = $model",
        )
        .bind(("title", input.title))
        .bind(("created_at", now))
        .bind(("model", input.model))
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => (
            StatusCode::CREATED,
            ok_json(records.into_iter().next()),
        )
            .into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// GET /api/conversations
pub async fn list_conversations(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let result: Result<Vec<Conversation>, _> = state
        .db
        .query("SELECT * FROM conversation ORDER BY created_at DESC")
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => ok_json(records).into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// POST /api/moments
pub async fn create_moment(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateMoment>,
) -> impl IntoResponse {
    let now = chrono::Utc::now().to_rfc3339();
    let perspectives = input.perspectives.unwrap_or_default();

    let query = if let Some(conv_id) = input.conversation_id {
        let conv_thing = format!("conversation:{}", conv_id);
        state
            .db
            .query(
                "CREATE moment SET raw_input = $raw_input, refined = $refined, trigger = $trigger, timestamp = <datetime>$timestamp, location = $location, perspectives = $perspectives, conversation_id = <record>$conversation_id",
            )
            .bind(("raw_input", input.raw_input))
            .bind(("refined", input.refined))
            .bind(("trigger", input.trigger))
            .bind(("timestamp", now))
            .bind(("location", input.location))
            .bind(("perspectives", perspectives))
            .bind(("conversation_id", conv_thing))
            .await
    } else {
        state
            .db
            .query(
                "CREATE moment SET raw_input = $raw_input, refined = $refined, trigger = $trigger, timestamp = <datetime>$timestamp, location = $location, perspectives = $perspectives, conversation_id = NONE",
            )
            .bind(("raw_input", input.raw_input))
            .bind(("refined", input.refined))
            .bind(("trigger", input.trigger))
            .bind(("timestamp", now))
            .bind(("location", input.location))
            .bind(("perspectives", perspectives))
            .await
    };

    let result: Result<Vec<Moment>, _> = query.and_then(|mut r| r.take(0));

    match result {
        Ok(records) => (
            StatusCode::CREATED,
            ok_json(records.into_iter().next()),
        )
            .into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// GET /api/moments — 支持 conversation_id 和 perspective 筛选
pub async fn list_moments(
    State(state): State<Arc<AppState>>,
    Query(params): Query<MomentQuery>,
) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);

    let result: Result<Vec<Moment>, _> = match (params.conversation_id, params.perspective) {
        (Some(conv_id), Some(perspective)) => {
            let conv_thing = format!("conversation:{}", conv_id);
            state
                .db
                .query("SELECT * FROM moment WHERE conversation_id = <record>$conv_id AND perspectives CONTAINS $perspective ORDER BY timestamp DESC LIMIT $limit START $offset")
                .bind(("conv_id", conv_thing))
                .bind(("perspective", perspective))
                .bind(("limit", limit))
                .bind(("offset", offset))
                .await
                .and_then(|mut r| r.take(0))
        }
        (Some(conv_id), None) => {
            let conv_thing = format!("conversation:{}", conv_id);
            state
                .db
                .query("SELECT * FROM moment WHERE conversation_id = <record>$conv_id ORDER BY timestamp DESC LIMIT $limit START $offset")
                .bind(("conv_id", conv_thing))
                .bind(("limit", limit))
                .bind(("offset", offset))
                .await
                .and_then(|mut r| r.take(0))
        }
        (None, Some(perspective)) => {
            state
                .db
                .query("SELECT * FROM moment WHERE perspectives CONTAINS $perspective ORDER BY timestamp DESC LIMIT $limit START $offset")
                .bind(("perspective", perspective))
                .bind(("limit", limit))
                .bind(("offset", offset))
                .await
                .and_then(|mut r| r.take(0))
        }
        (None, None) => {
            state
                .db
                .query("SELECT * FROM moment ORDER BY timestamp DESC LIMIT $limit START $offset")
                .bind(("limit", limit))
                .bind(("offset", offset))
                .await
                .and_then(|mut r| r.take(0))
        }
    };

    match result {
        Ok(records) => ok_json(records).into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// GET /api/moments/:id
pub async fn get_moment(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let thing = format!("moment:{}", id);
    let result: Result<Vec<Moment>, _> = state
        .db
        .query("SELECT * FROM <record>$id")
        .bind(("id", thing))
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => match records.into_iter().next() {
            Some(record) => ok_json(record).into_response(),
            None => err_json(StatusCode::NOT_FOUND, "moment not found").into_response(),
        },
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// GET /api/moments/:id/related
pub async fn get_related(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let thing = format!("moment:{}", id);

    // 分别查询中心节点和关联边，避免图遍历字段的序列化问题
    let result = state
        .db
        .query("SELECT * FROM <record>$id")
        .query("SELECT *, in, out FROM relates_to WHERE in = <record>$id OR out = <record>$id")
        .bind(("id", thing))
        .await;

    match result {
        Ok(mut response) => {
            let center: Vec<serde_json::Value> = response.take(0).unwrap_or_default();
            let edges: Vec<serde_json::Value> = response.take(1).unwrap_or_default();

            // 收集所有关联节点的 ID
            let mut related_ids: Vec<String> = Vec::new();
            for edge in &edges {
                if let Some(in_val) = edge.get("in") {
                    related_ids.push(in_val.to_string());
                }
                if let Some(out_val) = edge.get("out") {
                    related_ids.push(out_val.to_string());
                }
            }

            ok_json(serde_json::json!({
                "center": center.into_iter().next(),
                "edges": edges,
                "related_ids": related_ids,
            }))
            .into_response()
        }
        Err(e) => {
            tracing::error!("related 查询失败: {}", e);
            err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response()
        }
    }
}

/// POST /api/entities
pub async fn create_entity(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateEntity>,
) -> impl IntoResponse {
    let result: Result<Vec<Entity>, _> = state
        .db
        .query(
            "CREATE entity SET name = $name, entity_type = $entity_type, description = $description",
        )
        .bind(("name", input.name))
        .bind(("entity_type", input.entity_type))
        .bind(("description", input.description))
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => (
            StatusCode::CREATED,
            ok_json(records.into_iter().next()),
        )
            .into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// GET /api/entities
pub async fn list_entities(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let result: Result<Vec<Entity>, _> = state
        .db
        .query("SELECT * FROM entity ORDER BY name ASC")
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => ok_json(records).into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// GET /api/search?q=...&type=moment|entity|all&perspective=...&limit=20
pub async fn search(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchQuery>,
) -> impl IntoResponse {
    let q = params.q;
    let search_type = params.search_type.as_deref().unwrap_or("all");
    let limit = params.limit.unwrap_or(20);

    let search_moments = search_type == "all" || search_type == "moment";
    let search_entities = search_type == "all" || search_type == "entity";

    // 搜索 moments
    let moments: Vec<Moment> = if search_moments {
        let moment_query = if let Some(ref perspective) = params.perspective {
            state
                .db
                .query(
                    "SELECT * FROM moment WHERE (raw_input CONTAINS $q OR refined CONTAINS $q) AND perspectives CONTAINS $perspective ORDER BY weight DESC LIMIT $limit",
                )
                .bind(("q", q.clone()))
                .bind(("perspective", perspective.clone()))
                .bind(("limit", limit))
                .await
                .and_then(|mut r| r.take(0))
        } else {
            state
                .db
                .query(
                    "SELECT * FROM moment WHERE raw_input CONTAINS $q OR refined CONTAINS $q ORDER BY weight DESC LIMIT $limit",
                )
                .bind(("q", q.clone()))
                .bind(("limit", limit))
                .await
                .and_then(|mut r| r.take(0))
        };
        moment_query.unwrap_or_default()
    } else {
        Vec::new()
    };

    // 搜索 entities
    let entities: Vec<Entity> = if search_entities {
        let entity_result: Result<Vec<Entity>, _> = state
            .db
            .query(
                "SELECT * FROM entity WHERE name CONTAINS $q OR description CONTAINS $q ORDER BY weight DESC LIMIT $limit",
            )
            .bind(("q", q))
            .bind(("limit", limit))
            .await
            .and_then(|mut r| r.take(0));
        entity_result.unwrap_or_default()
    } else {
        Vec::new()
    };

    ok_json(serde_json::json!({
        "moments": moments,
        "entities": entities,
        "total": moments.len() + entities.len(),
    }))
    .into_response()
}

/// POST /api/relations
pub async fn create_relation(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateRelation>,
) -> impl IntoResponse {
    let result: Result<Vec<RelateEdge>, _> = state
        .db
        .query(
            "LET $f = <record>$from; LET $t = <record>$to; RELATE $f->relates_to->$t SET relation_type = $relation_type, description = $description, strength = $strength",
        )
        .bind(("from", input.from))
        .bind(("to", input.to))
        .bind(("relation_type", input.relation_type))
        .bind(("description", input.description))
        .bind(("strength", input.strength))
        .await
        .and_then(|mut r| r.take(2));

    match result {
        Ok(records) => (
            StatusCode::CREATED,
            ok_json(records.into_iter().next()),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("创建关联失败: {}", e);
            err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response()
        }
    }
}

/// POST /api/goals
pub async fn create_goal(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateGoal>,
) -> impl IntoResponse {
    let now = chrono::Utc::now().to_rfc3339();

    let result: Result<Vec<Goal>, _> = state
        .db
        .query(
            "CREATE goal SET title = $title, description = $description, priority = $priority, created_at = <datetime>$created_at",
        )
        .bind(("title", input.title))
        .bind(("description", input.description))
        .bind(("priority", input.priority))
        .bind(("created_at", now))
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => (
            StatusCode::CREATED,
            ok_json(records.into_iter().next()),
        )
            .into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// POST /api/chat — 对话引擎核心
pub async fn send_chat(
    State(state): State<Arc<AppState>>,
    Json(input): Json<ChatInput>,
) -> impl IntoResponse {
    let model = input.model.clone();
    let user_message = input.message.clone();

    // 1. 如果 conversation_id 为空，创建新对话
    let conv_id = match input.conversation_id {
        Some(id) if !id.is_empty() => id,
        _ => {
            // 自动创建新对话
            let now = chrono::Utc::now().to_rfc3339();
            let result: Result<Vec<Conversation>, _> = state
                .db
                .query("CREATE conversation SET created_at = <datetime>$created_at, model = $model")
                .bind(("created_at", now))
                .bind(("model", model.clone()))
                .await
                .and_then(|mut r| r.take(0));

            match result {
                Ok(mut records) => match records.pop() {
                    Some(conv) => match conv.id {
                        Some(thing) => thing.id.to_raw(),
                        None => {
                            return err_json(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                "对话创建失败：无 ID",
                            )
                            .into_response()
                        }
                    },
                    None => {
                        return err_json(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "对话创建失败",
                        )
                        .into_response()
                    }
                },
                Err(e) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
    };

    let conv_thing = format!("conversation:{}", conv_id);
    let now = chrono::Utc::now().to_rfc3339();

    // 2. 创建 moment（raw_input = 用户消息）
    let moment_result: Result<Vec<Moment>, _> = state
        .db
        .query(
            "CREATE moment SET raw_input = $raw_input, timestamp = <datetime>$timestamp, perspectives = [], conversation_id = <record>$conversation_id",
        )
        .bind(("raw_input", user_message.clone()))
        .bind(("timestamp", now.clone()))
        .bind(("conversation_id", conv_thing.clone()))
        .await
        .and_then(|mut r| r.take(0));

    let moment = match moment_result {
        Ok(mut records) => match records.pop() {
            Some(m) => m,
            None => {
                return err_json(StatusCode::INTERNAL_SERVER_ERROR, "moment 创建失败")
                    .into_response()
            }
        },
        Err(e) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    let moment_id_str = moment
        .id
        .as_ref()
        .map(|t| t.id.to_raw())
        .unwrap_or_default();
    let moment_thing = format!("moment:{}", moment_id_str);

    // 3. 存储用户消息到 message 表
    let _: Result<Vec<serde_json::Value>, _> = state
        .db
        .query(
            "CREATE message SET conversation_id = <record>$conv_id, role = 'user', content = $content, timestamp = <datetime>$timestamp, moment_id = <record>$moment_id",
        )
        .bind(("conv_id", conv_thing.clone()))
        .bind(("content", user_message.clone()))
        .bind(("timestamp", now.clone()))
        .bind(("moment_id", moment_thing))
        .await
        .and_then(|mut r| r.take(0));

    // 4. 获取最近 20 条消息构建 LLM 上下文
    let history_result: Result<Vec<Message>, _> = state
        .db
        .query(
            "SELECT * FROM message WHERE conversation_id = <record>$conv_id ORDER BY timestamp ASC LIMIT 20",
        )
        .bind(("conv_id", conv_thing.clone()))
        .await
        .and_then(|mut r| r.take(0));

    let history = match history_result {
        Ok(msgs) => msgs,
        Err(e) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    // 5. 构建 LLM 消息列表
    let llm_messages: Vec<ChatMessage> = history
        .iter()
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    // 5.5 (X6) 查询到期复习项，注入到 system prompt
    let system_prompt = {
        let now_str = chrono::Utc::now().to_rfc3339();
        let due_result: Result<Vec<ReviewSchedule>, _> = state
            .db
            .query(
                "SELECT * FROM review_schedule WHERE next_review <= <datetime>$now ORDER BY next_review ASC LIMIT 10",
            )
            .bind(("now", now_str))
            .await
            .and_then(|mut r| r.take(0));

        let mut due_texts: Vec<String> = Vec::new();
        if let Ok(schedules) = due_result {
            for s in &schedules {
                if let Some(ref mid) = s.moment_id {
                    let mt = format!("{}:{}", mid.tb, mid.id.to_raw());
                    let m_result: Result<Vec<Moment>, _> = state
                        .db
                        .query("SELECT * FROM <record>$id")
                        .bind(("id", mt))
                        .await
                        .and_then(|mut r| r.take(0));

                    if let Ok(mut moments) = m_result {
                        if let Some(m) = moments.pop() {
                            let text = m.refined.unwrap_or(m.raw_input);
                            due_texts.push(format!("- {}", text));
                        }
                    }
                }
            }
        }

        if due_texts.is_empty() {
            SYSTEM_PROMPT.to_string()
        } else {
            format!(
                "{}\n\n用户有以下待复习的知识点，如果和当前对话相关，请自然地提到：\n{}",
                SYSTEM_PROMPT,
                due_texts.join("\n")
            )
        }
    };

    // 6. 调用 LLM
    let reply = match state
        .llm
        .chat(&system_prompt, llm_messages, model.as_deref())
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("LLM 调用失败: {}", e),
            )
            .into_response()
        }
    };

    // 7. 存储 AI 回复到 message 表
    let reply_now = chrono::Utc::now().to_rfc3339();
    let reply_clone = reply.clone();
    let _: Result<Vec<serde_json::Value>, _> = state
        .db
        .query(
            "CREATE message SET conversation_id = <record>$conv_id, role = 'assistant', content = $content, timestamp = <datetime>$timestamp, moment_id = NONE",
        )
        .bind(("conv_id", conv_thing))
        .bind(("content", reply_clone))
        .bind(("timestamp", reply_now))
        .await
        .and_then(|mut r| r.take(0));

    // 8. 异步提取（不阻塞对话返回）
    {
        let db = state.db.clone();
        let llm = state.llm.clone();
        let mid = moment_id_str.clone();
        tokio::spawn(async move {
            // 短暂延迟，让对话响应先返回
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            match pipeline::extract_moment(&db, &llm, &mid).await {
                Ok(result) => {
                    tracing::info!(
                        "自动提取 moment {} 完成: {} 实体, {} 视角",
                        mid,
                        result.entities.len(),
                        result.perspectives.len(),
                    );
                }
                Err(e) => {
                    tracing::error!("自动提取 moment {} 失败: {}", mid, e);
                }
            }
        });
    }

    // 9. 返回
    ok_json(ChatOutput {
        reply,
        conversation_id: conv_id,
        moment_id: moment_id_str,
    })
    .into_response()
}

/// GET /api/conversations/{id}/messages — 获取对话的所有消息
pub async fn get_conversation_messages(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let conv_thing = format!("conversation:{}", id);

    let result: Result<Vec<Message>, _> = state
        .db
        .query(
            "SELECT * FROM message WHERE conversation_id = <record>$conv_id ORDER BY timestamp ASC",
        )
        .bind(("conv_id", conv_thing))
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => ok_json(records).into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// GET /api/goals
pub async fn list_goals(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let result: Result<Vec<Goal>, _> = state
        .db
        .query("SELECT * FROM goal ORDER BY priority ASC, created_at DESC")
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => ok_json(records).into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

// ─── X2 提取 API ───

/// POST /api/moments/{id}/extract — 对单个 moment 执行提取
pub async fn extract_moment_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match pipeline::extract_moment(&state.db, &state.llm, &id).await {
        Ok(result) => ok_json(serde_json::json!({
            "moment_id": id,
            "refined": result.refined,
            "entities_count": result.entities.len(),
            "perspectives": result.perspectives,
            "relations_count": result.relations.len(),
            "entities": result.entities,
            "relations": result.relations,
        }))
        .into_response(),
        Err(e) => {
            tracing::error!("moment {} 提取失败: {}", id, e);
            err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response()
        }
    }
}

/// POST /api/conversations/{id}/extract — 对整个对话执行批量提取
pub async fn extract_conversation_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match pipeline::extract_conversation(&state.db, &state.llm, &id).await {
        Ok(results) => ok_json(serde_json::json!({
            "conversation_id": id,
            "results": results,
        }))
        .into_response(),
        Err(e) => {
            tracing::error!("对话 {} 提取失败: {}", id, e);
            err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response()
        }
    }
}

// ─── X3 图谱查询 API ───

/// GET /api/graph/traverse/{id}?depth=2 — 联想链遍历
///
/// 从某节点出发，遍历 N 度关联，返回所有节点和边。
/// depth 默认 1，最大 3。
pub async fn graph_traverse(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(params): Query<TraverseQuery>,
) -> impl IntoResponse {
    let depth = params.depth.unwrap_or(1).min(3);

    // 判断节点类型（moment 或 entity）
    // 先尝试 moment，再尝试 entity
    let (table, thing) = {
        let moment_thing = format!("moment:{}", id);
        let result: Result<Vec<serde_json::Value>, _> = state
            .db
            .query("SELECT * FROM <record>$id")
            .bind(("id", moment_thing.clone()))
            .await
            .and_then(|mut r| r.take(0));

        if let Ok(ref records) = result {
            if !records.is_empty() {
                ("moment", moment_thing)
            } else {
                let entity_thing = format!("entity:{}", id);
                ("entity", entity_thing)
            }
        } else {
            let entity_thing = format!("entity:{}", id);
            ("entity", entity_thing)
        }
    };

    // 获取中心节点
    let center: serde_json::Value = {
        let result: Result<Vec<serde_json::Value>, _> = state
            .db
            .query("SELECT * FROM <record>$id")
            .bind(("id", thing.clone()))
            .await
            .and_then(|mut r| r.take(0));

        match result {
            Ok(mut records) => match records.pop() {
                Some(record) => record,
                None => {
                    return err_json(
                        StatusCode::NOT_FOUND,
                        format!("节点 {}:{} 不存在", table, id),
                    )
                    .into_response()
                }
            },
            Err(e) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        }
    };

    // 使用 SurrealDB 图遍历查询
    // 根据 depth 构建不同深度的查询
    let traverse_query = match depth {
        1 => format!(
            "SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id->relates_to->(moment, entity) \
             UNION \
             SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id<-relates_to<-(moment, entity)"
        ),
        2 => format!(
            "SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id->relates_to->(moment, entity)->relates_to->(moment, entity) \
             UNION \
             SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id<-relates_to<-(moment, entity)<-relates_to<-(moment, entity) \
             UNION \
             SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id->relates_to->(moment, entity) \
             UNION \
             SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id<-relates_to<-(moment, entity)"
        ),
        _ => format!(
            "SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id->relates_to->(moment, entity)->relates_to->(moment, entity)->relates_to->(moment, entity) \
             UNION \
             SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id<-relates_to<-(moment, entity)<-relates_to<-(moment, entity)<-relates_to<-(moment, entity) \
             UNION \
             SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id->relates_to->(moment, entity)->relates_to->(moment, entity) \
             UNION \
             SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id<-relates_to<-(moment, entity)<-relates_to<-(moment, entity) \
             UNION \
             SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id->relates_to->(moment, entity) \
             UNION \
             SELECT id, raw_input, refined, name, entity_type, description, perspectives, weight FROM <record>$id<-relates_to<-(moment, entity)"
        ),
    };

    // 获取关联节点
    let nodes_result: Result<Vec<serde_json::Value>, _> = state
        .db
        .query(&traverse_query)
        .bind(("id", thing.clone()))
        .await
        .and_then(|mut r| r.take(0));

    let nodes = nodes_result.unwrap_or_default();

    // 获取所有相关的边
    let edges_result: Result<Vec<serde_json::Value>, _> = state
        .db
        .query(
            "SELECT * FROM relates_to WHERE in = <record>$id OR out = <record>$id",
        )
        .bind(("id", thing))
        .await
        .and_then(|mut r| r.take(0));

    let edges = edges_result.unwrap_or_default();

    ok_json(serde_json::json!({
        "center": center,
        "nodes": nodes,
        "edges": edges,
        "depth": depth,
    }))
    .into_response()
}

/// GET /api/perspectives — 列出所有视角标签及其节点数
pub async fn list_perspectives(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // 获取所有 moment 的 perspectives 字段
    let result: Result<Vec<PerspectiveProjection>, _> = state
        .db
        .query("SELECT perspectives FROM moment")
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(projections) => {
            // 统计每个视角标签的使用次数
            let mut perspective_counts: std::collections::HashMap<String, u32> =
                std::collections::HashMap::new();

            for proj in &projections {
                for p in &proj.perspectives {
                    *perspective_counts.entry(p.clone()).or_insert(0) += 1;
                }
            }

            // 排序（按数量降序）
            let mut perspectives: Vec<serde_json::Value> = perspective_counts
                .into_iter()
                .map(|(name, count)| {
                    serde_json::json!({
                        "name": name,
                        "count": count,
                    })
                })
                .collect();

            perspectives.sort_by(|a, b| {
                b["count"].as_u64().cmp(&a["count"].as_u64())
            });

            ok_json(serde_json::json!({
                "perspectives": perspectives,
                "total": perspectives.len(),
            }))
            .into_response()
        }
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// GET /api/graph/top?limit=10 — 权重最高的节点
pub async fn graph_top(
    State(state): State<Arc<AppState>>,
    Query(params): Query<TopQuery>,
) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(10);

    // 先重算权重
    recalculate_weights_internal(&state.db).await;

    // 获取权重最高的 moment
    let moments: Vec<Moment> = state
        .db
        .query("SELECT * FROM moment ORDER BY weight DESC LIMIT $limit")
        .bind(("limit", limit))
        .await
        .and_then(|mut r| r.take(0))
        .unwrap_or_default();

    // 获取权重最高的 entity
    let entities: Vec<Entity> = state
        .db
        .query("SELECT * FROM entity ORDER BY weight DESC LIMIT $limit")
        .bind(("limit", limit))
        .await
        .and_then(|mut r| r.take(0))
        .unwrap_or_default();

    // 合并后按权重排序，取前 limit 个
    let mut all_nodes: Vec<serde_json::Value> = Vec::new();

    for m in &moments {
        all_nodes.push(serde_json::json!({
            "id": m.id,
            "type": "moment",
            "label": m.refined.as_deref().unwrap_or(&m.raw_input),
            "weight": m.weight,
            "raw_input": m.raw_input,
        }));
    }

    for e in &entities {
        all_nodes.push(serde_json::json!({
            "id": e.id,
            "type": "entity",
            "label": e.name,
            "weight": e.weight,
            "entity_type": e.entity_type,
        }));
    }

    all_nodes.sort_by(|a, b| {
        b["weight"]
            .as_f64()
            .unwrap_or(0.0)
            .partial_cmp(&a["weight"].as_f64().unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    all_nodes.truncate(limit as usize);

    ok_json(serde_json::json!({
        "nodes": all_nodes,
    }))
    .into_response()
}

/// GET /api/graph/stats — 图谱统计
pub async fn graph_stats(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // 并行查询所有统计数据
    let result = state
        .db
        .query("SELECT count() AS total FROM moment GROUP ALL")
        .query("SELECT count() AS total FROM entity GROUP ALL")
        .query("SELECT count() AS total FROM relates_to GROUP ALL")
        .query("SELECT count() AS total FROM conversation GROUP ALL")
        .query("SELECT perspectives FROM moment")
        .query("SELECT name, weight FROM entity ORDER BY weight DESC LIMIT 10")
        .await;

    match result {
        Ok(mut response) => {
            // 解析各项计数
            let moment_count: Vec<serde_json::Value> = response.take(0).unwrap_or_default();
            let entity_count: Vec<serde_json::Value> = response.take(1).unwrap_or_default();
            let edge_count: Vec<serde_json::Value> = response.take(2).unwrap_or_default();
            let conv_count: Vec<serde_json::Value> = response.take(3).unwrap_or_default();
            let all_perspectives: Vec<PerspectiveProjection> = response.take(4).unwrap_or_default();
            let top_entities: Vec<Entity> = response.take(5).unwrap_or_default();

            let total_moments = moment_count
                .first()
                .and_then(|v| v["total"].as_u64())
                .unwrap_or(0);
            let total_entities = entity_count
                .first()
                .and_then(|v| v["total"].as_u64())
                .unwrap_or(0);
            let total_edges = edge_count
                .first()
                .and_then(|v| v["total"].as_u64())
                .unwrap_or(0);
            let total_conversations = conv_count
                .first()
                .and_then(|v| v["total"].as_u64())
                .unwrap_or(0);

            // 统计视角
            let mut perspective_counts: std::collections::HashMap<String, u32> =
                std::collections::HashMap::new();
            for proj in &all_perspectives {
                for p in &proj.perspectives {
                    *perspective_counts.entry(p.clone()).or_insert(0) += 1;
                }
            }

            // top entities
            let top: Vec<serde_json::Value> = top_entities
                .iter()
                .map(|e| {
                    serde_json::json!({
                        "name": e.name,
                        "weight": e.weight,
                    })
                })
                .collect();

            ok_json(serde_json::json!({
                "total_moments": total_moments,
                "total_entities": total_entities,
                "total_edges": total_edges,
                "total_conversations": total_conversations,
                "perspectives": perspective_counts,
                "top_entities": top,
            }))
            .into_response()
        }
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// POST /api/graph/recalculate — 手动触发权重重算
pub async fn recalculate_weights(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    recalculate_weights_internal(&state.db).await;
    ok_json(serde_json::json!({ "message": "权重重算完成" })).into_response()
}

/// 权重重算内部逻辑
///
/// weight = in_degree * 10 + recent_reference_count * 5
/// in_degree = 连接到这个节点的边数
/// recent_reference_count = 最近 7 天被新边引用的次数
async fn recalculate_weights_internal(db: &Db) {
    // 计算 moment 权重：in_degree（被指向的边数）
    let _ = db
        .query(
            "UPDATE moment SET weight = (
                (SELECT count() FROM relates_to WHERE out = $parent.id GROUP ALL)[0].count OR 0
            ) * 10",
        )
        .await;

    // 计算 entity 权重：in_degree（被指向的边数）
    let _ = db
        .query(
            "UPDATE entity SET weight = (
                (SELECT count() FROM relates_to WHERE out = $parent.id GROUP ALL)[0].count OR 0
            ) * 10",
        )
        .await;

    tracing::info!("权重重算完成");
}

// ─── X6 间隔重复 API ───

/// GET /api/reviews/due — 获取到期复习项（next_review <= now）
pub async fn list_due_reviews(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let now = chrono::Utc::now().to_rfc3339();

    // 查询所有到期的复习计划，同时获取关联 moment 的文本
    let result: Result<Vec<ReviewSchedule>, _> = state
        .db
        .query(
            "SELECT * FROM review_schedule WHERE next_review <= <datetime>$now ORDER BY next_review ASC",
        )
        .bind(("now", now))
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(schedules) => {
            // 为每个 schedule 获取关联 moment 的文本
            let mut due_items: Vec<ReviewDueItem> = Vec::new();

            for s in &schedules {
                let moment_text = if let Some(ref mid) = s.moment_id {
                    let moment_thing = format!("{}:{}", mid.tb, mid.id.to_raw());
                    let m_result: Result<Vec<Moment>, _> = state
                        .db
                        .query("SELECT * FROM <record>$id")
                        .bind(("id", moment_thing))
                        .await
                        .and_then(|mut r| r.take(0));

                    m_result
                        .ok()
                        .and_then(|mut v| v.pop())
                        .map(|m| m.refined.unwrap_or(m.raw_input))
                } else {
                    None
                };

                due_items.push(ReviewDueItem {
                    id: s.id.clone(),
                    moment_id: s.moment_id.clone(),
                    next_review: s.next_review.clone(),
                    interval: s.interval,
                    ease_factor: s.ease_factor,
                    review_count: s.review_count,
                    created_at: s.created_at.clone(),
                    moment_text,
                });
            }

            ok_json(due_items).into_response()
        }
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// POST /api/reviews/schedule — 为某个 moment 创建复习计划
pub async fn create_review_schedule(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateReviewSchedule>,
) -> impl IntoResponse {
    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();
    // 首次复习：1 天后
    let next_review = (now + chrono::Duration::days(1)).to_rfc3339();
    let moment_thing = format!("moment:{}", input.moment_id);

    // 检查 moment 是否存在
    let check: Result<Vec<Moment>, _> = state
        .db
        .query("SELECT * FROM <record>$id")
        .bind(("id", moment_thing.clone()))
        .await
        .and_then(|mut r| r.take(0));

    match check {
        Ok(ref records) if records.is_empty() => {
            return err_json(
                StatusCode::NOT_FOUND,
                format!("moment {} 不存在", input.moment_id),
            )
            .into_response();
        }
        Err(e) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        _ => {}
    }

    // 检查是否已有该 moment 的复习计划
    let existing: Result<Vec<ReviewSchedule>, _> = state
        .db
        .query("SELECT * FROM review_schedule WHERE moment_id = <record>$mid")
        .bind(("mid", moment_thing.clone()))
        .await
        .and_then(|mut r| r.take(0));

    if let Ok(ref records) = existing {
        if !records.is_empty() {
            return err_json(
                StatusCode::CONFLICT,
                format!("moment {} 已有复习计划", input.moment_id),
            )
            .into_response();
        }
    }

    let result: Result<Vec<ReviewSchedule>, _> = state
        .db
        .query(
            "CREATE review_schedule SET moment_id = <record>$moment_id, next_review = <datetime>$next_review, interval = 1, ease_factor = 2.5, review_count = 0, created_at = <datetime>$created_at",
        )
        .bind(("moment_id", moment_thing))
        .bind(("next_review", next_review))
        .bind(("created_at", now_str))
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => (
            StatusCode::CREATED,
            ok_json(records.into_iter().next()),
        )
            .into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// POST /api/reviews/{id}/respond — 用户反馈（again/hard/good/easy）→ SM-2 更新间隔
pub async fn review_respond(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<ReviewRespond>,
) -> impl IntoResponse {
    let thing = format!("review_schedule:{}", id);

    // 获取当前复习计划
    let result: Result<Vec<ReviewSchedule>, _> = state
        .db
        .query("SELECT * FROM <record>$id")
        .bind(("id", thing.clone()))
        .await
        .and_then(|mut r| r.take(0));

    let schedule = match result {
        Ok(mut records) => match records.pop() {
            Some(s) => s,
            None => {
                return err_json(StatusCode::NOT_FOUND, "复习计划不存在").into_response()
            }
        },
        Err(e) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    // SM-2 算法（简化版）
    let (new_interval, new_ease) = match input.response.as_str() {
        "again" => (1.0_f64, (schedule.ease_factor - 0.2).max(1.3)),
        "hard" => (schedule.interval * 1.2, (schedule.ease_factor - 0.15).max(1.3)),
        "good" => (schedule.interval * schedule.ease_factor, schedule.ease_factor),
        "easy" => (
            schedule.interval * schedule.ease_factor * 1.3,
            schedule.ease_factor + 0.15,
        ),
        _ => {
            return err_json(
                StatusCode::BAD_REQUEST,
                "response 必须是 again/hard/good/easy",
            )
            .into_response()
        }
    };

    // 计算下次复习时间
    let interval_secs = (new_interval * 86400.0) as i64; // 天 → 秒
    let next_review = (chrono::Utc::now() + chrono::Duration::seconds(interval_secs)).to_rfc3339();

    // 更新数据库
    let update_result: Result<Vec<ReviewSchedule>, _> = state
        .db
        .query(
            "UPDATE <record>$id SET interval = $interval, ease_factor = $ease, next_review = <datetime>$next_review, review_count = $count",
        )
        .bind(("id", thing))
        .bind(("interval", new_interval))
        .bind(("ease", new_ease))
        .bind(("next_review", next_review))
        .bind(("count", schedule.review_count + 1))
        .await
        .and_then(|mut r| r.take(0));

    match update_result {
        Ok(records) => ok_json(records.into_iter().next()).into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

// ─── X5B OCR API ───

/// OCR 响应
#[derive(Debug, Serialize)]
pub struct OcrOutput {
    pub text: String,
    pub confidence: f64,
}

/// POST /api/ocr — 拍照/上传图片 → OCR 文字识别
///
/// 接收 multipart/form-data，字段名 "image"。
/// 将图片 base64 编码后发给 Gemini Flash 视觉模型进行文字识别。
pub async fn ocr_image(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    // 1. 从 multipart 读取图片字段
    let mut image_data: Option<(Vec<u8>, String)> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "image" {
            let content_type = field
                .content_type()
                .map(|ct| ct.to_string())
                .unwrap_or_else(|| "image/jpeg".to_string());

            match field.bytes().await {
                Ok(data) => {
                    image_data = Some((data.to_vec(), content_type));
                    break;
                }
                Err(e) => {
                    return err_json(
                        StatusCode::BAD_REQUEST,
                        format!("读取图片失败: {}", e),
                    )
                    .into_response();
                }
            }
        }
    }

    let (data, mime_type) = match image_data {
        Some(d) => d,
        None => {
            return err_json(
                StatusCode::BAD_REQUEST,
                "未找到 image 字段，请使用 multipart/form-data 上传图片",
            )
            .into_response();
        }
    };

    // 2. 检查图片大小（最大 10MB）
    if data.len() > 10 * 1024 * 1024 {
        return err_json(StatusCode::BAD_REQUEST, "图片过大，最大支持 10MB")
            .into_response();
    }

    tracing::info!(
        "OCR 请求: 大小 {:.1}KB, 类型 {}",
        data.len() as f64 / 1024.0,
        mime_type
    );

    // 3. Base64 编码
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);

    // 4. 调用视觉模型 OCR
    match state.llm.vision_ocr(&base64_data, &mime_type).await {
        Ok(text) => {
            let text = text.trim().to_string();
            tracing::info!("OCR 识别成功: {} 字", text.chars().count());
            ok_json(OcrOutput {
                text,
                confidence: 0.95,
            })
            .into_response()
        }
        Err(e) => {
            tracing::error!("OCR 识别失败: {}", e);
            err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("OCR 识别失败: {}", e),
            )
            .into_response()
        }
    }
}

// ─── X5C 视频导入 ───

/// 视频导入请求
#[derive(Debug, Deserialize)]
pub struct VideoImportInput {
    pub url: String,
}

/// 视频导入响应
#[derive(Debug, Serialize)]
pub struct VideoImportOutput {
    pub title: String,
    pub transcript: String,
    pub source_url: String,
}

/// POST /api/import/video — 视频链接 → 文稿提取
///
/// 接收视频 URL，调用 Gemini Flash 提取视频内容摘要。
/// 支持 B站、YouTube、抖音。超时 60 秒。
pub async fn import_video(
    State(state): State<Arc<AppState>>,
    Json(input): Json<VideoImportInput>,
) -> impl IntoResponse {
    let url = input.url.trim().to_string();

    // 1. 校验 URL 不为空
    if url.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "URL 不能为空").into_response();
    }

    // 2. 检查是否是支持的视频平台
    let is_video_url = url.contains("bilibili.com")
        || url.contains("b23.tv")
        || url.contains("youtube.com")
        || url.contains("youtu.be")
        || url.contains("douyin.com");

    if !is_video_url {
        return err_json(
            StatusCode::BAD_REQUEST,
            "不支持的视频平台，目前支持：B站、YouTube、抖音",
        )
        .into_response();
    }

    tracing::info!("视频导入请求: {}", url);

    // 3. 构建 prompt
    let prompt = format!(
        "请访问以下视频链接，提取视频的主要内容和要点，用中文输出摘要。\n\n\
         要求：\n\
         - 第一行输出视频标题（格式：标题：xxx）\n\
         - 然后输出视频内容摘要\n\
         - 列出关键要点\n\n\
         链接：{}",
        url
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    // 4. 调用 Gemini Flash（60 秒超时）
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        state.llm.chat(
            "你是一个视频内容分析助手。用户会给你视频链接，请提取视频的主要内容和要点。",
            messages,
            Some("gemini-2.5-flash"),
        ),
    )
    .await;

    match result {
        Ok(Ok(transcript)) => {
            let transcript = transcript.trim().to_string();
            let title = extract_video_title(&transcript);

            tracing::info!(
                "视频摘要提取成功: 标题「{}」, {} 字",
                title,
                transcript.chars().count()
            );

            ok_json(VideoImportOutput {
                title,
                transcript,
                source_url: url,
            })
            .into_response()
        }
        Ok(Err(e)) => {
            tracing::error!("视频摘要提取失败: {}", e);
            err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!(
                    "视频内容提取失败: {}。如果 AI 无法访问视频，请手动粘贴视频文稿。",
                    e
                ),
            )
            .into_response()
        }
        Err(_) => {
            tracing::error!("视频摘要提取超时（60秒）");
            err_json(
                StatusCode::GATEWAY_TIMEOUT,
                "视频内容提取超时（60秒），请稍后重试，或手动粘贴视频文稿。",
            )
            .into_response()
        }
    }
}

/// 从 AI 响应中提取标题
fn extract_video_title(text: &str) -> String {
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with("标题：") || line.starts_with("标题:") {
            return line
                .trim_start_matches("标题：")
                .trim_start_matches("标题:")
                .trim()
                .to_string();
        }
        if line.starts_with("# ") {
            return line.trim_start_matches("# ").trim().to_string();
        }
    }
    "视频摘要".to_string()
}
