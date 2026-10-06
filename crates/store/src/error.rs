use xenica_core::DomainError;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error(transparent)]
    Domain(#[from] DomainError),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Migrate(#[from] sqlx::migrate::MigrateError),
}

impl StoreError {
    /// 把数据库约束错误翻译成领域错误，其余原样返回。
    pub(crate) fn from_db(err: sqlx::Error) -> Self {
        if let sqlx::Error::Database(db) = &err {
            match db.code().as_deref() {
                // foreign_key_violation
                Some("23503") => return DomainError::NotFound.into(),
                // unique_violation
                Some("23505") => return StoreError::Conflict("already exists".into()),
                _ => {}
            }
        }
        StoreError::Database(err)
    }
}
