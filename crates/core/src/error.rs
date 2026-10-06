/// 领域层错误。HTTP 层负责把它映射成状态码。
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("{0}")]
    Invalid(String),
    #[error("not found")]
    NotFound,
}
