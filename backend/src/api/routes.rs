use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
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
}

#[derive(Debug, Deserialize)]
pub struct CreateEntity {
    pub name: String,
    pub entity_type: String,
    pub description: Option<String>,
}

// -- Relation --

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
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
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

/// GET /api/moments
pub async fn list_moments(
    State(state): State<Arc<AppState>>,
    Query(params): Query<MomentQuery>,
) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);

    let result: Result<Vec<Moment>, _> = if let Some(conv_id) = params.conversation_id {
        let conv_thing = format!("conversation:{}", conv_id);
        state
            .db
            .query("SELECT * FROM moment WHERE conversation_id = <record>$conv_id ORDER BY timestamp DESC LIMIT $limit START $offset")
            .bind(("conv_id", conv_thing))
            .bind(("limit", limit))
            .bind(("offset", offset))
            .await
            .and_then(|mut r| r.take(0))
    } else {
        state
            .db
            .query("SELECT * FROM moment ORDER BY timestamp DESC LIMIT $limit START $offset")
            .bind(("limit", limit))
            .bind(("offset", offset))
            .await
            .and_then(|mut r| r.take(0))
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

    // 查找一度关联节点（出边 + 入边）
    let result: Result<Vec<serde_json::Value>, _> = state
        .db
        .query(
            "SELECT *, ->relates_to->moment|entity AS outgoing, <-relates_to<-moment|entity AS incoming FROM <record>$id",
        )
        .bind(("id", thing))
        .await
        .and_then(|mut r| r.take(0));

    match result {
        Ok(records) => ok_json(records).into_response(),
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
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

/// GET /api/search?q=...
pub async fn search(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchQuery>,
) -> impl IntoResponse {
    let q = params.q;

    // 搜索 moments 和 entities
    let result = state
        .db
        .query("SELECT * FROM moment WHERE raw_input CONTAINS $q OR refined CONTAINS $q")
        .query("SELECT * FROM entity WHERE name CONTAINS $q OR description CONTAINS $q")
        .bind(("q", q))
        .await;

    match result {
        Ok(mut response) => {
            let moments: Vec<Moment> = response.take(0).unwrap_or_default();
            let entities: Vec<Entity> = response.take(1).unwrap_or_default();
            ok_json(serde_json::json!({
                "moments": moments,
                "entities": entities,
            }))
            .into_response()
        }
        Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// POST /api/relations
pub async fn create_relation(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateRelation>,
) -> impl IntoResponse {
    let result: Result<Vec<serde_json::Value>, _> = state
        .db
        .query(
            "RELATE <record>$from->relates_to-><record>$to SET relation_type = $relation_type, description = $description, strength = $strength",
        )
        .bind(("from", input.from))
        .bind(("to", input.to))
        .bind(("relation_type", input.relation_type))
        .bind(("description", input.description))
        .bind(("strength", input.strength))
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

    // 6. 调用 LLM
    let reply = match state
        .llm
        .chat(SYSTEM_PROMPT, llm_messages, model.as_deref())
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
