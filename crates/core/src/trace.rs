use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{TraceId, UserId};

/// 谁做的。规则 2：AI 和处理器只提议，人裁决——所以永远要分得清是谁写的。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Actor {
    /// 某个账号。旧痕迹（鉴权之前写的）没有 `id`。
    User {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<UserId>,
    },
    /// 处理器（插件），带版本，便于以后重跑。
    Processor { id: String, version: String },
}

impl Actor {
    pub fn user(id: UserId) -> Actor {
        Actor::User { id: Some(id) }
    }

    /// 存储用的紧凑形式：`user:<id>`（旧数据是 `user`）或 `processor:<id>@<version>`。
    pub fn to_storage(&self) -> String {
        match self {
            Actor::User { id: None } => "user".to_owned(),
            Actor::User { id: Some(id) } => format!("user:{id}"),
            Actor::Processor { id, version } => format!("processor:{id}@{version}"),
        }
    }

    pub fn from_storage(s: &str) -> Option<Actor> {
        if s == "user" {
            return Some(Actor::User { id: None });
        }
        if let Some(id) = s.strip_prefix("user:") {
            return id.parse().ok().map(|id| Actor::user(UserId(id)));
        }
        let rest = s.strip_prefix("processor:")?;
        let (id, version) = rest.split_once('@')?;
        Some(Actor::Processor {
            id: id.to_owned(),
            version: version.to_owned(),
        })
    }
}

/// 痕迹：只增不改的事件记录（数据库触发器保证不能改、不能删）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Trace {
    pub id: TraceId,
    pub at: DateTime<Utc>,
    pub actor: Actor,
    /// 例如 `node.created`、`edge.deleted`。
    pub action: String,
    /// 被操作的节点或关系的 ID。
    pub subject: Uuid,
    #[schema(value_type = Object)]
    pub detail: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn actor_storage_round_trip() {
        for a in [
            Actor::User { id: None },
            Actor::user(UserId::new()),
            Actor::Processor {
                id: "asr".into(),
                version: "0.3.0".into(),
            },
        ] {
            assert_eq!(Actor::from_storage(&a.to_storage()), Some(a));
        }
        assert_eq!(Actor::from_storage("robot"), None);
        assert_eq!(Actor::from_storage("user:nope"), None);
    }
}
