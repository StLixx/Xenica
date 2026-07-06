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
