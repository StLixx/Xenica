use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Node {
    pub id: Uuid,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Edge {
    pub id: Uuid,
    pub source_id: Uuid,
    pub target_id: Uuid,
    pub label: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateNodeRequest {
    pub content: String,
    #[serde(default)]
    pub connections: Vec<NodeConnection>,
}

#[derive(Debug, Deserialize)]
pub struct NodeConnection {
    pub target_id: Uuid,
    pub label: String,
}

#[derive(Debug, Serialize)]
pub struct NeighborNode {
    pub node: Node,
    pub edge_id: Uuid,
    pub edge_label: String,
    pub direction: String,
}

#[derive(Debug, Serialize)]
pub struct NodeDetail {
    pub node: Node,
    pub neighbors: Vec<NeighborNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Task {
    pub id: Uuid,
    pub task_type: String,
    pub payload: serde_json::Value,
    pub status: String,
    pub attempts: i32,
    pub max_attempts: i32,
    pub next_execution_at: DateTime<Utc>,
    pub error_details: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_mode() -> String {
    "hybrid".into()
}

fn default_language() -> String {
    "zh".into()
}
