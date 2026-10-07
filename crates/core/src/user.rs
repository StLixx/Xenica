use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{DomainError, UserId};

/// 账号。密码哈希不在这里：它只存在 store 里，永远不出现在接口上（规则 9）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct User {
    pub id: UserId,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

pub const MAX_USER_NAME_CHARS: usize = 32;
pub const MIN_PASSWORD_CHARS: usize = 8;
const MAX_PASSWORD_CHARS: usize = 256;

/// 用户名：去掉首尾空白后 1–32 个字符，中间不能有空白或控制字符。比较时不分大小写（由数据库索引保证）。
pub fn normalize_user_name(name: &str) -> Result<String, DomainError> {
    let name = name.trim();
    let n = name.chars().count();
    if n == 0 || n > MAX_USER_NAME_CHARS {
        return Err(DomainError::Invalid(format!(
            "用户名要 1–{MAX_USER_NAME_CHARS} 个字符"
        )));
    }
    if name.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(DomainError::Invalid("用户名里不能有空格".into()));
    }
    Ok(name.to_owned())
}

pub fn check_password(password: &str) -> Result<(), DomainError> {
    let n = password.chars().count();
    if !(MIN_PASSWORD_CHARS..=MAX_PASSWORD_CHARS).contains(&n) {
        return Err(DomainError::Invalid(format!(
            "密码至少 {MIN_PASSWORD_CHARS} 个字符"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_names() {
        assert_eq!(normalize_user_name("  lixx ").unwrap(), "lixx");
        assert_eq!(normalize_user_name("李").unwrap(), "李");
        assert!(normalize_user_name("").is_err());
        assert!(normalize_user_name("a b").is_err());
        assert!(normalize_user_name(&"x".repeat(33)).is_err());
    }

    #[test]
    fn passwords() {
        assert!(check_password("1234567").is_err());
        assert!(check_password("12345678").is_ok());
        assert!(check_password("密码密码密码密码").is_ok());
    }
}
