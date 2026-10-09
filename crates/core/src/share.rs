//! 分享链接：一段可以交给别人（或 AI）的地址凭据。

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::DomainError;

/// 分享链接的用法。决定拿到这个地址的人能做什么。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum ShareMode {
    /// 只读：不用登录就能读到文字说明和原图（AI 读链接靠它）。
    Read,
    /// 可写：能调用工具的 AI 用这个地址改画面。
    Write,
}

impl ShareMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
        }
    }

    pub fn parse(value: &str) -> Result<Self, DomainError> {
        match value {
            "read" => Ok(Self::Read),
            "write" => Ok(Self::Write),
            other => Err(DomainError::Invalid(format!("不认识的用法：{other}"))),
        }
    }
}

impl std::fmt::Display for ShareMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 用法来回转() {
        for mode in [ShareMode::Read, ShareMode::Write] {
            assert_eq!(ShareMode::parse(mode.as_str()).unwrap(), mode);
            assert_eq!(mode.to_string(), mode.as_str());
        }
        assert!(ShareMode::parse("admin").is_err());
    }
}
