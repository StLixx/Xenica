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

/// 应用共享状态
#[derive(Clone)]
pub struct AppState {
    pub db: Db,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct Moment {
    pub id: Option<Thing>,
    pub raw_input: String,
    pub refined: Option<String>,
    pub trigger: Option<String>,
    pub timestamp: String,
    pub location: Option<String>,
    pub perspectives: Vec<String>,
    pub conversation_id: Option<Thing>,
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
