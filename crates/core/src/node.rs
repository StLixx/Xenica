use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{DomainError, MAX_TITLE_CHARS, NodeId};

/// 节点：一切有身份的东西（知识点、文件、任务、设置……）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Node {
    pub id: NodeId,
    /// 类型键，例如 `note`。以后类型本身也会成为节点，这里先用字符串。
    pub kind: String,
    pub title: String,
    /// 节点内容。结构由类型决定，核心不解释它。
    #[schema(value_type = Object)]
    pub body: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 新建节点的输入。
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct NewNode {
    /// 省略时为 `note`。
    #[serde(default)]
    pub kind: Option<String>,
    pub title: String,
    #[serde(default)]
    #[schema(value_type = Option<Object>)]
    pub body: Option<serde_json::Value>,
}

impl NewNode {
    pub const DEFAULT_KIND: &'static str = "note";

    /// 校验并规范化：去掉标题首尾空白，补默认值。
    pub fn normalize(self) -> Result<NewNode, DomainError> {
        let kind = self.kind.unwrap_or_else(|| Self::DEFAULT_KIND.to_owned());
        let kind = validate_kind(&kind)?;
        Ok(NewNode {
            kind: Some(kind),
            title: validate_title(&self.title)?,
            body: Some(self.body.unwrap_or_else(|| serde_json::json!({}))),
        })
    }
}

/// 修改节点的输入。只改给出的字段。
#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
pub struct NodePatch {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    #[schema(value_type = Option<Object>)]
    pub body: Option<serde_json::Value>,
}

impl NodePatch {
    pub fn normalize(self) -> Result<NodePatch, DomainError> {
        if self.title.is_none() && self.body.is_none() {
            return Err(DomainError::Invalid("nothing to update".into()));
        }
        Ok(NodePatch {
            title: self.title.as_deref().map(validate_title).transpose()?,
            body: self.body,
        })
    }
}

pub(crate) fn validate_kind(kind: &str) -> Result<String, DomainError> {
    let ok = !kind.is_empty()
        && kind.len() <= 64
        && kind
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '.');
    if ok {
        Ok(kind.to_owned())
    } else {
        Err(DomainError::Invalid(
            "kind must be 1-64 chars of a-z, 0-9, '_' or '.'".into(),
        ))
    }
}

fn validate_title(title: &str) -> Result<String, DomainError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(DomainError::Invalid("title must not be empty".into()));
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(DomainError::Invalid(format!(
            "title must be at most {MAX_TITLE_CHARS} characters"
        )));
    }
    Ok(title.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new(title: &str) -> NewNode {
        NewNode {
            kind: None,
            title: title.into(),
            body: None,
        }
    }

    #[test]
    fn trims_title_and_fills_defaults() {
        let n = new("  秦统一六国 ").normalize().unwrap();
        assert_eq!(n.title, "秦统一六国");
        assert_eq!(n.kind.as_deref(), Some("note"));
        assert_eq!(n.body, Some(serde_json::json!({})));
    }

    #[test]
    fn rejects_blank_and_too_long_titles() {
        assert!(new("   ").normalize().is_err());
        assert!(new(&"字".repeat(MAX_TITLE_CHARS + 1)).normalize().is_err());
        assert!(new(&"字".repeat(MAX_TITLE_CHARS)).normalize().is_ok());
    }

    #[test]
    fn rejects_bad_kind() {
        let n = NewNode {
            kind: Some("Note Kind".into()),
            ..new("x")
        };
        assert!(n.normalize().is_err());
    }

    #[test]
    fn empty_patch_is_invalid() {
        assert!(NodePatch::default().normalize().is_err());
    }
}
