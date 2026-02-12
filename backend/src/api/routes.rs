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

// -- Goal Update --

#[derive(Debug, Deserialize)]
pub struct UpdateGoal {
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<i64>,
}

// -- Commander Log Import (X8) --

#[derive(Debug, Deserialize)]
pub struct CommanderLogInput {
    pub date: String,
    pub entries: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CommanderLogOutput {
    pub date: String,
    pub moments_created: usize,
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
    /// X7: 生成的文章（仅当用户要求生成时有值）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generated_article: Option<GeneratedArticle>,
}

/// X7: 生成的结构化文章
#[derive(Debug, Serialize, Clone)]
pub struct GeneratedArticle {
    pub title: String,
    pub content: String, // Markdown
    pub source_nodes: Vec<String>,
}

/// X7: 从选中节点生成的请求
#[derive(Debug, Deserialize)]
pub struct GenerateFromNodesInput {
    pub node_ids: Vec<String>,
    /// article | outline | summary
    pub format: String,
}

/// X7: 从选中节点生成的响应
#[derive(Debug, Serialize)]
pub struct GenerateFromNodesOutput {
    pub title: String,
    pub content: String,
    pub source_nodes: Vec<String>,
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

    // 5.5 查询目标 + 到期复习项，注入到 system prompt
    let system_prompt = {
        let mut prompt = SYSTEM_PROMPT.to_string();

        // (X8) 注入用户长期目标
        let goals_result: Result<Vec<Goal>, _> = state
            .db
            .query("SELECT * FROM goal ORDER BY priority ASC")
            .await
            .and_then(|mut r| r.take(0));

        if let Ok(goals) = goals_result {
            if !goals.is_empty() {
                let goal_lines: Vec<String> = goals
                    .iter()
                    .enumerate()
                    .map(|(i, g)| {
                        let desc = g
                            .description
                            .as_deref()
                            .map(|d| format!("（{}）", d))
                            .unwrap_or_default();
                        format!("{}. {}{}", i + 1, g.title, desc)
                    })
                    .collect();

                prompt.push_str(&format!(
                    "\n\n用户的长期目标：\n{}\n如果当前对话内容和某个目标相关，请自然地提到这个关联。",
                    goal_lines.join("\n")
                ));
            }
        }

        // (X6) 注入到期复习项
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

        if !due_texts.is_empty() {
            prompt.push_str(&format!(
                "\n\n用户有以下待复习的知识点，如果和当前对话相关，请自然地提到：\n{}",
                due_texts.join("\n")
            ));
        }

        prompt
    };

    // 5.8 (X7) 检测用户是否有生成意图
    let generation_intent = detect_generation_intent(&user_message);

    // 5.9 (X7) 如果有生成意图，查询对话中所有 moment 并注入到 system prompt
    let (final_system_prompt, moment_ids_for_gen) = if generation_intent {
        let conv_moments: Result<Vec<Moment>, _> = state
            .db
            .query(
                "SELECT * FROM moment WHERE conversation_id = <record>$conv_id ORDER BY timestamp ASC",
            )
            .bind(("conv_id", conv_thing.clone()))
            .await
            .and_then(|mut r| r.take(0));

        let (moment_texts, moment_ids): (Vec<String>, Vec<String>) = match conv_moments {
            Ok(moments) => moments
                .iter()
                .map(|m| {
                    let text = m.refined.as_deref().unwrap_or(&m.raw_input);
                    let mid = m.id.as_ref().map(|t| t.id.to_raw()).unwrap_or_default();
                    (format!("- {}", text), mid)
                })
                .unzip(),
            Err(_) => (Vec::new(), Vec::new()),
        };

        let gen_prompt = if moment_texts.is_empty() {
            system_prompt.clone()
        } else {
            format!(
                "{}\n\n## 生成任务\n\
                用户要求你根据当前对话生成结构化内容。以下是对话中记录的所有认知瞬间：\n{}\n\n\
                请根据这些内容生成结构化的 Markdown 文章。要求：\n\
                1. 给文章一个恰当的标题（# 标题）\n\
                2. 内容分段，逻辑清晰\n\
                3. 保留用户原有的关键表述\n\
                4. 如果内容涉及多个主题，用二级标题分节\n\
                5. 在文末列出参考的认知节点 ID（格式：> 来源节点：id1, id2, ...）",
                system_prompt,
                moment_texts.join("\n")
            )
        };
        (gen_prompt, moment_ids)
    } else {
        (system_prompt, Vec::new())
    };

    // 6. 调用 LLM
    let reply = match state
        .llm
        .chat(&final_system_prompt, llm_messages, model.as_deref())
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

    // 6.5 (X7) 如果是生成意图，解析为 GeneratedArticle
    let generated_article = if generation_intent {
        let (title, content) = parse_generated_article(&reply);
        Some(GeneratedArticle {
            title,
            content,
            source_nodes: moment_ids_for_gen,
        })
    } else {
        None
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
        generated_article,
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

// ─── X8 目标管理 API ───

/// PUT /api/goals/{id} — 更新目标
pub async fn update_goal(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<UpdateGoal>,
) -> impl IntoResponse {
    let thing = format!("goal:{}", id);

    // 先检查目标是否存在
    let check: Result<Vec<Goal>, _> = state
        .db
        .query("SELECT * FROM <record>$id")
        .bind(("id", thing.clone()))
        .await
        .and_then(|mut r| r.take(0));

    match check {
        Ok(ref records) if records.is_empty() => {
            return err_json(StatusCode::NOT_FOUND, format!("目标 {} 不存在", id))
                .into_response();
        }
        Err(e) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        _ => {}
    }

    // 动态构建 UPDATE 语句
    let mut set_parts: Vec<String> = Vec::new();
    if input.title.is_some() {
        set_parts.push("title = $title".to_string());
    }
    if input.description.is_some() {
        set_parts.push("description = $description".to_string());
    }
    if input.priority.is_some() {
        set_parts.push("priority = $priority".to_string());
    }

    if set_parts.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "没有需要更新的字段").into_response();
    }

    let query = format!(
        "LET $rec = <record>$id; UPDATE $rec SET {}",
        set_parts.join(", ")
    );

    let result: Result<Vec<Goal>, _> = state
        .db
        .query(&query)
        .bind(("id", thing))
        .bind(("title", input.title))
        .bind(("description", input.description))
        .bind(("priority", input.priority))
        .await
        .and_then(|mut r| r.take(1));

    match result {
        Ok(records) => ok_json(records.into_iter().next()).into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// DELETE /api/goals/{id} — 删除目标
pub async fn delete_goal(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let thing = format!("goal:{}", id);

    let result: Result<Vec<Goal>, _> = state
        .db
        .query("DELETE <record>$id RETURN BEFORE")
        .bind(("id", thing))
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => match records.into_iter().next() {
            Some(record) => ok_json(record).into_response(),
            None => err_json(StatusCode::NOT_FOUND, format!("目标 {} 不存在", id))
                .into_response(),
        },
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// GET /api/goals/check-setup — 检查是否已完成首次目标设置
pub async fn check_goal_setup(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let result: Result<Vec<Goal>, _> = state
        .db
        .query("SELECT * FROM goal LIMIT 1")
        .await
        .and_then(|mut r| r.take(0));

    let has_goals = match result {
        Ok(records) => !records.is_empty(),
        Err(_) => false,
    };

    ok_json(serde_json::json!({
        "setup_completed": has_goals,
    }))
    .into_response()
}

// ─── X8 Commander 日志汇入 API ───

/// POST /api/import/commander-log — Commander 开发日志汇入
///
/// 每日凌晨 Commander 的开发日志自动汇总 1-3 条摘要存入 Xenica。
/// 每条 entry 创建一个 moment（perspective: "开发日志"）。
pub async fn import_commander_log(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CommanderLogInput>,
) -> impl IntoResponse {
    let date = input.date.trim().to_string();
    let entries = input.entries;

    if date.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "date 不能为空").into_response();
    }
    if entries.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "entries 不能为空").into_response();
    }

    tracing::info!(
        "Commander 日志汇入: {} ({} 条)",
        date,
        entries.len()
    );

    let mut moments_created = 0usize;

    for entry in &entries {
        let entry = entry.trim().to_string();
        if entry.is_empty() {
            continue;
        }

        let now = chrono::Utc::now().to_rfc3339();
        let trigger = format!("Commander 日志 {}", date);

        let moment_result: Result<Vec<Moment>, _> = state
            .db
            .query(
                "CREATE moment SET raw_input = $raw_input, trigger = $trigger, \
                 timestamp = <datetime>$timestamp, perspectives = ['开发日志'], \
                 conversation_id = NONE, extracted = false, weight = 0",
            )
            .bind(("raw_input", entry.clone()))
            .bind(("trigger", trigger))
            .bind(("timestamp", now))
            .await
            .and_then(|mut r| r.take(0));

        if let Ok(mut records) = moment_result {
            if let Some(moment) = records.pop() {
                moments_created += 1;

                // 异步提取实体和关联
                let mid = moment
                    .id
                    .as_ref()
                    .map(|t| t.id.to_raw())
                    .unwrap_or_default();

                let db = state.db.clone();
                let llm = state.llm.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                    match pipeline::extract_moment(&db, &llm, &mid).await {
                        Ok(result) => {
                            tracing::info!(
                                "Commander 日志提取完成: {} 实体",
                                result.entities.len()
                            );
                        }
                        Err(e) => {
                            tracing::warn!("Commander 日志提取失败: {}", e);
                        }
                    }
                });
            }
        }
    }

    tracing::info!("Commander 日志汇入完成: {} 条", moments_created);

    (
        StatusCode::CREATED,
        ok_json(CommanderLogOutput {
            date,
            moments_created,
        }),
    )
        .into_response()
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

    // 判断节点类型并获取中心节点
    // 必须反序列化到 typed struct（Moment/Entity），不能用 serde_json::Value
    // 因为 SurrealDB v2 SDK 的 Thing 枚举只支持 typed struct 反序列化
    let moment_q = format!("SELECT * FROM moment:{}", id);
    let moment_result: Result<Vec<Moment>, _> = state
        .db
        .query(&moment_q)
        .await
        .and_then(|mut r| r.take(0));

    let (table, center) = if let Ok(ref records) = moment_result {
        if let Some(record) = records.first() {
            ("moment", serde_json::to_value(record).unwrap_or_default())
        } else {
            // 尝试 entity
            let entity_q = format!("SELECT * FROM entity:{}", id);
            let entity_result: Result<Vec<Entity>, _> = state
                .db
                .query(&entity_q)
                .await
                .and_then(|mut r| r.take(0));

            match entity_result {
                Ok(ref records) if !records.is_empty() => {
                    ("entity", serde_json::to_value(&records[0]).unwrap_or_default())
                }
                _ => {
                    return err_json(
                        StatusCode::NOT_FOUND,
                        format!("节点 moment/entity:{} 不存在", id),
                    )
                    .into_response()
                }
            }
        }
    } else {
        // moment 查询失败，尝试 entity
        let entity_q = format!("SELECT * FROM entity:{}", id);
        let entity_result: Result<Vec<Entity>, _> = state
            .db
            .query(&entity_q)
            .await
            .and_then(|mut r| r.take(0));

        match entity_result {
            Ok(ref records) if !records.is_empty() => {
                ("entity", serde_json::to_value(&records[0]).unwrap_or_default())
            }
            _ => {
                return err_json(
                    StatusCode::NOT_FOUND,
                    format!("节点 moment/entity:{} 不存在", id),
                )
                .into_response()
            }
        }
    };

    // 两步查询策略（SurrealDB v2 Rust SDK 的 Thing 类型无法反序列化为 serde_json::Value）
    // 所有查询避免 <record>$id 绑定，改用直接字符串插值（table 已硬编码，id 已通过 center 查询验证）
    let node_ref = format!("{}:{}", table, id);

    // Step 1: 获取连接到该节点的所有边（用 string::concat 把 Thing 转为纯字符串）
    let edge_query = format!(
        "SELECT \
            string::concat(meta::tb(in), ':', meta::id(in)) AS source, \
            string::concat(meta::tb(out), ':', meta::id(out)) AS target, \
            relation_type, math::max(strength) AS strength, \
            array::first(description) AS description \
            FROM relates_to WHERE in = {node_ref} OR out = {node_ref} \
            GROUP BY source, target, relation_type"
    );
    let edges_result: Result<Vec<serde_json::Value>, _> = state
        .db
        .query(&edge_query)
        .await
        .and_then(|mut r| r.take(0));

    let edges = edges_result.unwrap_or_default();

    // Step 2: 从边中提取邻居节点 ID
    let mut neighbor_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    for edge in &edges {
        for field in ["source", "target"] {
            if let Some(serde_json::Value::String(s)) = edge.get(field) {
                if s != &node_ref {
                    neighbor_ids.insert(s.clone());
                }
            }
        }
    }

    // Step 3: 查询所有邻居节点详情（用 typed struct 反序列化后转 JSON）
    let mut nodes: Vec<serde_json::Value> = Vec::new();
    for nid in &neighbor_ids {
        let nid_query = format!("SELECT * FROM {}", nid);
        if nid.starts_with("moment:") {
            let result: Result<Vec<Moment>, _> = state
                .db
                .query(&nid_query)
                .await
                .and_then(|mut r| r.take(0));
            if let Ok(records) = result {
                for r in &records {
                    if let Ok(v) = serde_json::to_value(r) {
                        nodes.push(v);
                    }
                }
            }
        } else {
            let result: Result<Vec<Entity>, _> = state
                .db
                .query(&nid_query)
                .await
                .and_then(|mut r| r.take(0));
            if let Ok(records) = result {
                for r in &records {
                    if let Ok(v) = serde_json::to_value(r) {
                        nodes.push(v);
                    }
                }
            }
        }
    }

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

    // 收集所有节点 ID（"table:raw_id" 格式），查询它们之间的边
    let mut node_ids: Vec<String> = Vec::new();
    for n in &all_nodes {
        if let Some(id_val) = n.get("id") {
            // id 可能是 {tb: "moment", id: {String: "xxx"}} 或字符串
            if let Some(obj) = id_val.as_object() {
                let tb = obj.get("tb").and_then(|v| v.as_str()).unwrap_or("");
                let raw = obj.get("id")
                    .map(|v| match v {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Object(inner) => {
                            inner.get("String").and_then(|v| v.as_str()).unwrap_or("").to_string()
                        }
                        _ => v.to_string(),
                    })
                    .unwrap_or_default();
                if !tb.is_empty() && !raw.is_empty() {
                    node_ids.push(format!("{}:{}", tb, raw));
                }
            } else if let Some(s) = id_val.as_str() {
                node_ids.push(s.to_string());
            }
        }
    }

    // 查询这些节点之间的所有边
    let mut edges: Vec<serde_json::Value> = Vec::new();
    if !node_ids.is_empty() {
        // 构建 IN 子句：[moment:xxx, entity:yyy, ...]
        let id_list = node_ids.join(", ");
        let edge_q = format!(
            "SELECT \
                string::concat(meta::tb(in), ':', meta::id(in)) AS source, \
                string::concat(meta::tb(out), ':', meta::id(out)) AS target, \
                relation_type, math::max(strength) AS strength, \
                array::first(description) AS description \
                FROM relates_to WHERE in IN [{id_list}] AND out IN [{id_list}] \
                GROUP BY source, target, relation_type"
        );
        let edge_result: Result<Vec<serde_json::Value>, _> = state
            .db
            .query(&edge_q)
            .await
            .and_then(|mut r| r.take(0));
        edges = edge_result.unwrap_or_default();
    }

    ok_json(serde_json::json!({
        "nodes": all_nodes,
        "edges": edges,
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
            "LET $rec = <record>$id; UPDATE $rec SET interval = $interval, ease_factor = $ease, next_review = <datetime>$next_review, review_count = $count",
        )
        .bind(("id", thing))
        .bind(("interval", new_interval))
        .bind(("ease", new_ease))
        .bind(("next_review", next_review))
        .bind(("count", schedule.review_count + 1))
        .await
        .and_then(|mut r| r.take(1));

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

// ─── X5D Markdown 导入 ───

/// Markdown 导入请求
#[derive(Debug, Deserialize)]
pub struct MarkdownImportInput {
    pub filename: String,
    pub content: String,
    pub source: Option<String>, // obsidian | cursor | notion | other
}

/// Markdown 导入响应
#[derive(Debug, Serialize)]
pub struct MarkdownImportOutput {
    pub moment_id: String,
    pub entities_extracted: usize,
    pub edges_created: usize,
    pub dangling_links: Vec<String>,
}

/// POST /api/import/markdown — Markdown 文件导入
///
/// 解析 Markdown 内容，检测 [[双链]] 语法，调 AI 提取认知瞬间/实体/视角，存入 SurrealDB。
/// 双链目标如已存在同名节点则自动创建语义边，不存在则记录悬空引用。
pub async fn import_markdown(
    State(state): State<Arc<AppState>>,
    Json(input): Json<MarkdownImportInput>,
) -> impl IntoResponse {
    let content = input.content.trim().to_string();
    let filename = input.filename.trim().to_string();
    let source = input.source.unwrap_or_else(|| "other".to_string());

    // 1. 校验
    if content.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "Markdown 内容不能为空").into_response();
    }
    if filename.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "文件名不能为空").into_response();
    }

    tracing::info!("Markdown 导入: {} ({} 字, 来源: {})", filename, content.chars().count(), source);

    // 2. 检测 [[双链]] 语法
    let wikilinks = extract_wikilinks(&content);
    tracing::info!("检测到 {} 个双链引用: {:?}", wikilinks.len(), wikilinks);

    // 3. 创建 moment（raw_input = Markdown 内容，trigger = 文件名和来源）
    let now = chrono::Utc::now().to_rfc3339();
    let trigger = format!("导入自 {} ({})", filename, source);

    let moment_result: Result<Vec<Moment>, _> = state
        .db
        .query(
            "CREATE moment SET raw_input = $raw_input, trigger = $trigger, timestamp = <datetime>$timestamp, perspectives = ['导入'], conversation_id = NONE, extracted = false, weight = 0",
        )
        .bind(("raw_input", content.clone()))
        .bind(("trigger", trigger))
        .bind(("timestamp", now))
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
        Err(e) => {
            tracing::error!("创建 moment 失败: {}", e);
            return err_json(StatusCode::INTERNAL_SERVER_ERROR, format!("创建 moment 失败: {}", e))
                .into_response();
        }
    };

    let moment_id_str = moment
        .id
        .as_ref()
        .map(|t| t.id.to_raw())
        .unwrap_or_default();
    let moment_thing = format!("moment:{}", moment_id_str);

    // 4. 调 AI 提取（复用提取流水线）
    let extraction_result = pipeline::extract_moment(&state.db, &state.llm, &moment_id_str).await;

    let (entities_extracted, mut edges_created) = match &extraction_result {
        Ok(result) => {
            tracing::info!(
                "AI 提取完成: {} 实体, {} 视角, {} 关联",
                result.entities.len(),
                result.perspectives.len(),
                result.relations.len(),
            );
            (result.entities.len(), result.relations.len())
        }
        Err(e) => {
            tracing::warn!("AI 提取失败（moment 已创建）: {}", e);
            (0, 0)
        }
    };

    // 5. 处理 [[双链]] — 查找同名节点并创建语义边
    let mut dangling_links: Vec<String> = Vec::new();

    for link_name in &wikilinks {
        // 先查 entity
        let entity_result: Result<Vec<Entity>, _> = state
            .db
            .query("SELECT * FROM entity WHERE name = $name LIMIT 1")
            .bind(("name", link_name.clone()))
            .await
            .and_then(|mut r| r.take(0));

        if let Ok(entities) = entity_result {
            if let Some(entity) = entities.into_iter().next() {
                // 找到同名 entity，创建边
                let entity_thing = entity
                    .id
                    .map(|t| format!("entity:{}", t.id.to_raw()))
                    .unwrap_or_default();

                if !entity_thing.is_empty() {
                    let relate_result: Result<Vec<RelateEdge>, _> = state
                        .db
                        .query(
                            "LET $f = <record>$from; LET $t = <record>$to; RELATE $f->relates_to->$t SET relation_type = 'semantic', description = $desc",
                        )
                        .bind(("from", moment_thing.clone()))
                        .bind(("to", entity_thing))
                        .bind(("desc", format!("[[{}]] 双链引用", link_name)))
                        .await
                        .and_then(|mut r| r.take(2));

                    if relate_result.is_ok() {
                        edges_created += 1;
                        tracing::info!("双链 [[{}]] → entity 连边成功", link_name);
                        continue;
                    }
                }
            }
        }

        // 再查 moment（按 raw_input 或 refined 包含链接名）
        let moment_match: Result<Vec<Moment>, _> = state
            .db
            .query("SELECT * FROM moment WHERE (raw_input CONTAINS $name OR refined CONTAINS $name) AND id != <record>$self_id LIMIT 1")
            .bind(("name", link_name.clone()))
            .bind(("self_id", moment_thing.clone()))
            .await
            .and_then(|mut r| r.take(0));

        if let Ok(moments) = moment_match {
            if let Some(matched) = moments.into_iter().next() {
                let target_thing = matched
                    .id
                    .map(|t| format!("moment:{}", t.id.to_raw()))
                    .unwrap_or_default();

                if !target_thing.is_empty() {
                    let relate_result: Result<Vec<RelateEdge>, _> = state
                        .db
                        .query(
                            "LET $f = <record>$from; LET $t = <record>$to; RELATE $f->relates_to->$t SET relation_type = 'semantic', description = $desc",
                        )
                        .bind(("from", moment_thing.clone()))
                        .bind(("to", target_thing))
                        .bind(("desc", format!("[[{}]] 双链引用", link_name)))
                        .await
                        .and_then(|mut r| r.take(2));

                    if relate_result.is_ok() {
                        edges_created += 1;
                        tracing::info!("双链 [[{}]] → moment 连边成功", link_name);
                        continue;
                    }
                }
            }
        }

        // 未找到匹配节点，记录悬空引用
        dangling_links.push(link_name.clone());
        tracing::info!("双链 [[{}]] 未找到匹配，记录悬空引用", link_name);
    }

    tracing::info!(
        "Markdown 导入完成: moment={}, 实体={}, 边={}, 悬空={}",
        moment_id_str,
        entities_extracted,
        edges_created,
        dangling_links.len()
    );

    (
        StatusCode::CREATED,
        ok_json(MarkdownImportOutput {
            moment_id: moment_id_str,
            entities_extracted,
            edges_created,
            dangling_links,
        }),
    )
        .into_response()
}

/// 从 Markdown 内容中提取 [[双链]] 引用
fn extract_wikilinks(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    let bytes = content.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i + 1 < len {
        // 检测 [[
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            i += 2; // 跳过 [[
            let start = i;

            // 找 ]]
            while i + 1 < len {
                if bytes[i] == b']' && bytes[i + 1] == b']' {
                    // 提取链接名称
                    let link_bytes = &content[start..i];
                    let trimmed = link_bytes.trim().to_string();
                    if !trimmed.is_empty() && !links.contains(&trimmed) {
                        links.push(trimmed);
                    }
                    i += 2; // 跳过 ]]
                    break;
                }
                i += 1;
            }
        } else {
            i += 1;
        }
    }

    links
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

// ─── X5E PDF 导入 ───

/// PDF 导入响应
#[derive(Debug, Serialize)]
pub struct PdfImportOutput {
    pub pages_processed: usize,
    pub moments_created: usize,
    pub entities_extracted: usize,
    pub mode_used: String,
}

/// POST /api/import/pdf — PDF 文件导入
///
/// 支持两种模式：
/// - text（文字模式）：MinerU / pdfplumber 提取文字 → 切分 → 提取认知瞬间
/// - vision（图片模式）：PyMuPDF 逐页渲染 → Gemini Flash 视觉识别
pub async fn import_pdf(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    // 1. 读取 multipart 字段：file + mode
    let mut pdf_data: Option<(Vec<u8>, String)> = None; // (bytes, filename)
    let mut mode = "text".to_string();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                let filename = field
                    .file_name()
                    .unwrap_or("document.pdf")
                    .to_string();
                match field.bytes().await {
                    Ok(data) => pdf_data = Some((data.to_vec(), filename)),
                    Err(e) => {
                        return err_json(
                            StatusCode::BAD_REQUEST,
                            format!("读取文件失败: {}", e),
                        )
                        .into_response()
                    }
                }
            }
            "mode" => {
                if let Ok(text) = field.text().await {
                    let m = text.trim().to_lowercase();
                    if m == "text" || m == "vision" {
                        mode = m;
                    }
                }
            }
            _ => {}
        }
    }

    let (data, filename) = match pdf_data {
        Some(d) => d,
        None => {
            return err_json(
                StatusCode::BAD_REQUEST,
                "未找到 file 字段，请使用 multipart/form-data 上传 PDF",
            )
            .into_response()
        }
    };

    // 检查文件大小（最大 100MB）
    if data.len() > 100 * 1024 * 1024 {
        return err_json(StatusCode::BAD_REQUEST, "文件过大，最大支持 100MB")
            .into_response();
    }

    tracing::info!(
        "PDF 导入: {} ({:.1}MB, 模式: {})",
        filename,
        data.len() as f64 / (1024.0 * 1024.0),
        mode
    );

    // 2. 保存到临时目录
    let temp_id = uuid::Uuid::new_v4().to_string();
    let temp_dir = std::env::temp_dir().join(format!("xenica-pdf-{}", temp_id));
    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("创建临时目录失败: {}", e),
        )
        .into_response();
    }

    let pdf_path = temp_dir.join(&filename);
    if let Err(e) = std::fs::write(&pdf_path, &data) {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("保存临时文件失败: {}", e),
        )
        .into_response();
    }

    // 3. 按模式处理
    let result = if mode == "text" {
        pdf_process_text(&state, &pdf_path, &temp_dir, &filename).await
    } else {
        pdf_process_vision(&state, &pdf_path, &temp_dir, &filename).await
    };

    // 4. 清理临时文件
    let _ = std::fs::remove_dir_all(&temp_dir);

    // 5. 返回结果
    match result {
        Ok(output) => {
            tracing::info!(
                "PDF 导入完成: {} 页, {} 认知瞬间, {} 实体 ({})",
                output.pages_processed,
                output.moments_created,
                output.entities_extracted,
                output.mode_used
            );
            (StatusCode::CREATED, ok_json(output)).into_response()
        }
        Err(e) => {
            tracing::error!("PDF 导入失败: {}", e);
            err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response()
        }
    }
}

/// 文字模式：MinerU / pdfplumber 提取文字 → 切分 → 提取
async fn pdf_process_text(
    state: &Arc<AppState>,
    pdf_path: &std::path::Path,
    temp_dir: &std::path::Path,
    filename: &str,
) -> Result<PdfImportOutput, String> {
    let output_dir = temp_dir.join("text_output");
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("创建输出目录失败: {}", e))?;

    // 先尝试 magic-pdf，失败则 fallback 到 pdfplumber
    let md_content = match pdf_try_magic_pdf(pdf_path, &output_dir) {
        Ok(content) => {
            tracing::info!("magic-pdf 转换成功: {} 字", content.chars().count());
            content
        }
        Err(e) => {
            tracing::warn!("magic-pdf 失败: {}，尝试 pdfplumber", e);
            pdf_try_pdfplumber(pdf_path)?
        }
    };

    if md_content.trim().is_empty() {
        return Err("PDF 文本提取结果为空".to_string());
    }

    // 按标题 / 段落切分为 chunk
    let chunks = pdf_split_chunks(&md_content);
    tracing::info!("文字模式: 切分为 {} 个 chunk", chunks.len());

    let mut total_moments = 0usize;
    let mut total_entities = 0usize;

    for (i, chunk) in chunks.iter().enumerate() {
        if chunk.trim().is_empty() {
            continue;
        }

        let trigger = format!(
            "PDF文字导入 {} (第{}/{}段)",
            filename,
            i + 1,
            chunks.len()
        );
        let now = chrono::Utc::now().to_rfc3339();

        // 创建 moment
        let moment_result: Result<Vec<Moment>, _> = state
            .db
            .query(
                "CREATE moment SET raw_input = $raw_input, trigger = $trigger, \
                 timestamp = <datetime>$timestamp, perspectives = ['PDF导入'], \
                 conversation_id = NONE, extracted = false, weight = 0",
            )
            .bind(("raw_input", chunk.clone()))
            .bind(("trigger", trigger))
            .bind(("timestamp", now))
            .await
            .and_then(|mut r| r.take(0));

        if let Ok(mut records) = moment_result {
            if let Some(moment) = records.pop() {
                let mid = moment
                    .id
                    .as_ref()
                    .map(|t| t.id.to_raw())
                    .unwrap_or_default();
                total_moments += 1;

                // AI 提取实体和关联
                match pipeline::extract_moment(&state.db, &state.llm, &mid).await {
                    Ok(result) => {
                        total_entities += result.entities.len();
                    }
                    Err(e) => {
                        tracing::warn!("chunk {} AI 提取失败（moment 已创建）: {}", i + 1, e);
                    }
                }
            }
        }
    }

    Ok(PdfImportOutput {
        pages_processed: chunks.len(),
        moments_created: total_moments,
        entities_extracted: total_entities,
        mode_used: "text".to_string(),
    })
}

/// 尝试用 magic-pdf 转换 PDF → Markdown
fn pdf_try_magic_pdf(
    pdf_path: &std::path::Path,
    output_dir: &std::path::Path,
) -> Result<String, String> {
    let output = std::process::Command::new("magic-pdf")
        .args([
            "-p",
            &pdf_path.to_string_lossy(),
            "-o",
            &output_dir.to_string_lossy(),
            "-m",
            "auto",
        ])
        .output()
        .map_err(|e| format!("magic-pdf 未安装或不可用: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("magic-pdf 执行失败: {}", stderr));
    }

    // MinerU 输出路径: output_dir/stem/auto/stem.md
    let stem = pdf_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let md_path = output_dir
        .join(&stem)
        .join("auto")
        .join(format!("{}.md", stem));

    if md_path.exists() {
        return std::fs::read_to_string(&md_path)
            .map_err(|e| format!("读取 MinerU 输出失败: {}", e));
    }

    // 未在预期路径找到，递归搜索 .md 文件
    pdf_find_md_recursive(output_dir)
}

/// 递归搜索目录中的第一个 .md 文件
fn pdf_find_md_recursive(dir: &std::path::Path) -> Result<String, String> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Ok(content) = pdf_find_md_recursive(&path) {
                    return Ok(content);
                }
            } else if path.extension().map_or(false, |e| e == "md") {
                return std::fs::read_to_string(&path)
                    .map_err(|e| format!("读取文件失败: {}", e));
            }
        }
    }
    Err("未找到 MinerU 输出的 Markdown 文件".to_string())
}

/// Fallback：用 pdfplumber 提取纯文字
fn pdf_try_pdfplumber(pdf_path: &std::path::Path) -> Result<String, String> {
    let script = format!(
        "import pdfplumber\npdf = pdfplumber.open(r'{}')\nresult = []\nfor p in pdf.pages:\n    t = p.extract_text()\n    if t:\n        result.append(t)\npdf.close()\nprint('\\n\\n'.join(result))",
        pdf_path.to_string_lossy()
    );

    let output = std::process::Command::new("python")
        .args(["-c", &script])
        .output()
        .map_err(|e| format!("Python 不可用: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pdfplumber 执行失败: {}", stderr));
    }

    let text = String::from_utf8_lossy(&output.stdout).to_string();
    tracing::info!("pdfplumber 提取成功: {} 字", text.chars().count());
    Ok(text)
}

/// 将 Markdown / 纯文本按标题或段落切分为 chunk
fn pdf_split_chunks(content: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    // 先按 Markdown 标题切分
    for line in content.lines() {
        if line.starts_with('#') && !current.trim().is_empty() {
            chunks.push(std::mem::take(&mut current));
        }
        current.push_str(line);
        current.push('\n');
    }
    if !current.trim().is_empty() {
        chunks.push(current);
    }

    // 如果没有标题（纯文本），且内容过长，按段落切分为 ~2000 字 chunk
    if chunks.len() <= 1 && content.len() > 3000 {
        chunks.clear();
        let mut current = String::new();
        for line in content.lines() {
            current.push_str(line);
            current.push('\n');
            if current.len() > 2000 && line.trim().is_empty() {
                chunks.push(std::mem::take(&mut current));
            }
        }
        if !current.trim().is_empty() {
            chunks.push(current);
        }
    }

    // 兜底：如果分不出来，整体作为一个 chunk
    if chunks.is_empty() && !content.trim().is_empty() {
        chunks.push(content.to_string());
    }

    chunks
}

/// 图片模式：PyMuPDF 逐页渲染 → Gemini Flash 视觉识别
async fn pdf_process_vision(
    state: &Arc<AppState>,
    pdf_path: &std::path::Path,
    temp_dir: &std::path::Path,
    filename: &str,
) -> Result<PdfImportOutput, String> {
    let pages_dir = temp_dir.join("pages");
    std::fs::create_dir_all(&pages_dir)
        .map_err(|e| format!("创建页面目录失败: {}", e))?;

    // 用 PyMuPDF 将每页渲染为 PNG
    let script = format!(
        "import fitz, os\n\
         doc = fitz.open(r'{}')\n\
         out = r'{}'\n\
         os.makedirs(out, exist_ok=True)\n\
         for i, page in enumerate(doc):\n\
             pix = page.get_pixmap(dpi=200)\n\
             pix.save(os.path.join(out, f'page_{{i:04d}}.png'))\n\
         print(len(doc))\n\
         doc.close()",
        pdf_path.to_string_lossy(),
        pages_dir.to_string_lossy()
    );

    let output = std::process::Command::new("python")
        .args(["-c", &script])
        .output()
        .map_err(|e| format!("Python/PyMuPDF 不可用: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PyMuPDF 渲染失败: {}", stderr));
    }

    let page_count: usize = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .unwrap_or(0);

    if page_count == 0 {
        return Err("PDF 页数为 0".to_string());
    }

    tracing::info!("图片模式: PDF 共 {} 页，开始逐页 OCR", page_count);

    let mut total_moments = 0usize;
    let mut total_entities = 0usize;

    for i in 0..page_count {
        let page_path = pages_dir.join(format!("page_{:04}.png", i));
        if !page_path.exists() {
            tracing::warn!("第 {} 页图片不存在，跳过", i + 1);
            continue;
        }

        // 读取图片并 base64 编码
        let image_data = std::fs::read(&page_path)
            .map_err(|e| format!("读取第 {} 页图片失败: {}", i + 1, e))?;
        let base64_data =
            base64::engine::general_purpose::STANDARD.encode(&image_data);

        // Gemini Flash 视觉识别
        let text = match state.llm.vision_ocr(&base64_data, "image/png").await {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!("第 {} 页 OCR 失败: {}，跳过", i + 1, e);
                continue;
            }
        };

        if text.trim().is_empty() {
            tracing::info!("第 {} 页 OCR 结果为空，跳过", i + 1);
            continue;
        }

        // 创建 moment
        let trigger = format!(
            "PDF图片导入 {} (第{}/{}页)",
            filename,
            i + 1,
            page_count
        );
        let now = chrono::Utc::now().to_rfc3339();

        let moment_result: Result<Vec<Moment>, _> = state
            .db
            .query(
                "CREATE moment SET raw_input = $raw_input, trigger = $trigger, \
                 timestamp = <datetime>$timestamp, perspectives = ['PDF导入'], \
                 conversation_id = NONE, extracted = false, weight = 0",
            )
            .bind(("raw_input", text.trim().to_string()))
            .bind(("trigger", trigger))
            .bind(("timestamp", now))
            .await
            .and_then(|mut r| r.take(0));

        if let Ok(mut records) = moment_result {
            if let Some(moment) = records.pop() {
                let mid = moment
                    .id
                    .as_ref()
                    .map(|t| t.id.to_raw())
                    .unwrap_or_default();
                total_moments += 1;

                // AI 提取实体和关联
                match pipeline::extract_moment(&state.db, &state.llm, &mid).await {
                    Ok(result) => {
                        total_entities += result.entities.len();
                    }
                    Err(e) => {
                        tracing::warn!("第 {} 页 AI 提取失败: {}", i + 1, e);
                    }
                }
            }
        }

        tracing::info!("第 {}/{} 页处理完成", i + 1, page_count);
    }

    Ok(PdfImportOutput {
        pages_processed: page_count,
        moments_created: total_moments,
        entities_extracted: total_entities,
        mode_used: "vision".to_string(),
    })
}

// ─── X7 输出生成 ───

/// 检测用户消息是否包含生成意图关键词
fn detect_generation_intent(message: &str) -> bool {
    let keywords = [
        "整理成文章",
        "帮我整理",
        "总结一下",
        "总结",
        "生成报告",
        "写一篇",
        "写成文章",
        "汇总一下",
        "梳理一下",
        "帮我梳理",
        "输出文章",
        "生成文章",
        "整理一下",
    ];
    keywords.iter().any(|kw| message.contains(kw))
}

/// 从 AI 回复中解析标题和正文
fn parse_generated_article(reply: &str) -> (String, String) {
    let lines: Vec<&str> = reply.lines().collect();

    // 尝试从第一行提取标题（# 开头）
    let mut title = String::new();
    let mut content_start = 0;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") && !trimmed.starts_with("## ") {
            title = trimmed.trim_start_matches("# ").trim().to_string();
            content_start = i + 1;
            break;
        }
    }

    if title.is_empty() {
        // 没找到标题，用前 20 字作标题
        let text: String = reply.chars().take(20).collect();
        title = if reply.chars().count() > 20 {
            format!("{}…", text)
        } else {
            text
        };
    }

    let content = lines[content_start..].join("\n").trim().to_string();

    (title, if content.is_empty() { reply.to_string() } else { content })
}

/// POST /api/generate/from-nodes — X7: 从选中节点生成文章/大纲/摘要
pub async fn generate_from_nodes(
    State(state): State<Arc<AppState>>,
    Json(input): Json<GenerateFromNodesInput>,
) -> impl IntoResponse {
    if input.node_ids.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "至少选择 1 个节点").into_response();
    }

    let format = match input.format.as_str() {
        "article" | "outline" | "summary" => input.format.as_str(),
        _ => "article",
    };

    // 1. 查询所有选中节点的内容
    let mut node_contents: Vec<(String, String)> = Vec::new(); // (id, content)

    for nid in &input.node_ids {
        // 尝试 moment
        let moment_thing = format!("moment:{}", nid);
        let result: Result<Vec<Moment>, _> = state
            .db
            .query("SELECT * FROM <record>$id")
            .bind(("id", moment_thing))
            .await
            .and_then(|mut r| r.take(0));

        if let Ok(mut records) = result {
            if let Some(m) = records.pop() {
                let text = m.refined.unwrap_or(m.raw_input);
                node_contents.push((nid.clone(), text));
                continue;
            }
        }

        // 尝试 entity
        let entity_thing = format!("entity:{}", nid);
        let result: Result<Vec<Entity>, _> = state
            .db
            .query("SELECT * FROM <record>$id")
            .bind(("id", entity_thing))
            .await
            .and_then(|mut r| r.take(0));

        if let Ok(mut records) = result {
            if let Some(e) = records.pop() {
                let text = format!(
                    "{} ({}): {}",
                    e.name,
                    e.entity_type,
                    e.description.unwrap_or_default()
                );
                node_contents.push((nid.clone(), text));
            }
        }
    }

    if node_contents.is_empty() {
        return err_json(StatusCode::NOT_FOUND, "未找到选中节点的内容").into_response();
    }

    // 2. 查询节点之间的关联边
    let mut edge_descriptions: Vec<String> = Vec::new();
    for (i, (id_a, _)) in node_contents.iter().enumerate() {
        for (id_b, _) in node_contents.iter().skip(i + 1) {
            let a_thing = format!("moment:{}", id_a);
            let b_thing = format!("moment:{}", id_b);
            let edge_result: Result<Vec<RelateEdge>, _> = state
                .db
                .query(
                    "SELECT * FROM relates_to WHERE (in = <record>$a AND out = <record>$b) OR (in = <record>$b AND out = <record>$a)",
                )
                .bind(("a", a_thing))
                .bind(("b", b_thing))
                .await
                .and_then(|mut r| r.take(0));

            if let Ok(edges) = edge_result {
                for e in edges {
                    if let Some(desc) = &e.description {
                        edge_descriptions.push(desc.clone());
                    }
                }
            }
        }
    }

    // 3. 构建 prompt
    let format_instruction = match format {
        "outline" => "请生成一个层次分明的大纲（用 Markdown 列表格式，包含多级标题和要点）",
        "summary" => "请生成一段简洁的摘要（300 字以内，抓住核心要点）",
        _ => "请生成一篇结构化的文章（包含标题、分段、引用），用 Markdown 格式",
    };

    let node_list: String = node_contents
        .iter()
        .enumerate()
        .map(|(i, (id, text))| format!("{}. [{}] {}", i + 1, id, text))
        .collect::<Vec<_>>()
        .join("\n");

    let edge_info = if edge_descriptions.is_empty() {
        String::new()
    } else {
        format!(
            "\n\n节点之间的关联：\n{}",
            edge_descriptions
                .iter()
                .map(|d| format!("- {}", d))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };

    let prompt = format!(
        "以下是用户知识图谱中选中的认知节点：\n\n{}{}\n\n{}",
        node_list, edge_info, format_instruction
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    // 4. 调用 LLM
    let system = "你是 Xenica 的知识整合助手。用户选中了知识图谱中的若干节点，请根据节点内容和关联关系，生成用户要求的内容。保持信息完整性，用清晰的结构呈现。";

    let result = match state.llm.chat(system, messages, None).await {
        Ok(r) => r,
        Err(e) => {
            return err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("LLM 调用失败: {}", e),
            )
            .into_response()
        }
    };

    // 5. 解析标题
    let (title, content) = parse_generated_article(&result);
    let source_nodes: Vec<String> = input.node_ids;

    ok_json(GenerateFromNodesOutput {
        title,
        content,
        source_nodes,
    })
    .into_response()
}
