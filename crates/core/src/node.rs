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
    /// 可以为空：没有标题时界面用正文第一行代替。
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
    /// 客户端可以自己生成 ID（UUID v7），这样不用等服务器就能接着编辑。省略时由服务器生成。
    #[serde(default)]
    #[schema(value_type = Option<String>, format = Uuid)]
    pub id: Option<NodeId>,
    /// 省略时为 `note`。
    #[serde(default)]
    pub kind: Option<String>,
    /// 可省略。
    #[serde(default)]
    pub title: String,
    /// 约定：文字内容放在 `md`（Markdown），其中的 `#标记` 和 `[[名字]]` 会自动连到同名节点。
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
            id: self.id,
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

/// 节点正文里的 Markdown 文本（`body.md`），没有就是 `None`。
pub fn md(body: &serde_json::Value) -> Option<&str> {
    body.get("md").and_then(|v| v.as_str())
}

/// 在某个节点里按顺序插入新的子节点（一次可以插多个，例如粘贴一整段笔记）。
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct NewChildren {
    /// 插到第几个位置（从 0 开始）；省略时放到最后。
    #[serde(default)]
    pub index: Option<u32>,
    pub nodes: Vec<NewNode>,
}

impl NewChildren {
    pub const MAX: usize = 1000;
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
            id: None,
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
    fn md_reads_text_body() {
        let n = new("x").normalize().unwrap();
        assert_eq!(md(n.body.as_ref().unwrap()), None);
        assert_eq!(md(&serde_json::json!({ "md": "a #b" })), Some("a #b"));
    }

    #[test]
    fn allows_blank_but_not_too_long_titles() {
        assert_eq!(new("   ").normalize().unwrap().title, "");
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
