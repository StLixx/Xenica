use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{DomainError, EdgeId, NodeId, node::validate_kind};

/// 关系：两个节点之间有类型、有方向的连接。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Edge {
    pub id: EdgeId,
    pub source: NodeId,
    pub target: NodeId,
    /// 关系类型键，例如 `related`。以后关系类型本身也会成为节点。
    pub kind: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct NewEdge {
    pub source: NodeId,
    pub target: NodeId,
    /// 省略时为 `related`。
    #[serde(default)]
    pub kind: Option<String>,
}

impl NewEdge {
    pub const DEFAULT_KIND: &'static str = "related";

    pub fn normalize(self) -> Result<NewEdge, DomainError> {
        if self.source == self.target {
            return Err(DomainError::Invalid(
                "an edge cannot connect a node to itself".into(),
            ));
        }
        let kind = self.kind.unwrap_or_else(|| Self::DEFAULT_KIND.to_owned());
        Ok(NewEdge {
            kind: Some(validate_kind(&kind)?),
            ..self
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_self_loop() {
        let id = NodeId::new();
        let e = NewEdge {
            source: id,
            target: id,
            kind: None,
        };
        assert!(e.normalize().is_err());
    }

    #[test]
    fn fills_default_kind() {
        let e = NewEdge {
            source: NodeId::new(),
            target: NodeId::new(),
            kind: None,
        };
        assert_eq!(e.normalize().unwrap().kind.as_deref(), Some("related"));
    }
}
