use serde_json::json;
use uuid::Uuid;
use xenica_core::{Actor, DomainError, NodeId};

use crate::{Store, StoreError, trace};

/// 一个已存的文件。
pub struct StoredFile {
    pub mime: String,
    pub bytes: Vec<u8>,
}

impl Store {
    /// 存文件，内容相同就复用已有的那份。返回文件 ID。
    pub async fn put_file(
        &self,
        actor: &Actor,
        sha256: &str,
        mime: &str,
        bytes: &[u8],
    ) -> Result<Uuid, StoreError> {
        let mut tx = self.pool.begin().await?;
        if let Some(id) = sqlx::query_scalar!("select id from files where sha256 = $1", sha256)
            .fetch_optional(&mut *tx)
            .await?
        {
            return Ok(id);
        }
        let id = NodeId::new().0;
        sqlx::query!(
            "insert into files (id, sha256, mime, size, bytes) values ($1, $2, $3, $4, $5)",
            id,
            sha256,
            mime,
            i32::try_from(bytes.len()).unwrap_or(i32::MAX),
            bytes,
        )
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from_db)?;
        trace(
            &mut tx,
            actor,
            "file.created",
            id,
            json!({ "mime": mime, "size": bytes.len() }),
        )
        .await?;
        tx.commit().await?;
        Ok(id)
    }

    pub async fn get_file(&self, id: Uuid) -> Result<StoredFile, StoreError> {
        sqlx::query_as!(
            StoredFile,
            "select mime, bytes from files where id = $1",
            id
        )
        .fetch_optional(&self.pool)
        .await?
        .ok_or(DomainError::NotFound.into())
    }
}
