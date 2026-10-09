use chrono::{DateTime, Utc};
use serde_json::json;
use uuid::Uuid;
use xenica_core::{Actor, DomainError, NodeId, ShareMode};

use crate::{Store, StoreError, trace};

/// 一条分享链接。`mode` 是 `read` 或 `write`（表上有约束）。
#[derive(Debug, Clone)]
pub struct Share {
    pub id: Uuid,
    pub node: Uuid,
    pub token: String,
    pub mode: String,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

impl Share {
    /// 这条链接的用法（`read` 或 `write`）。
    pub fn mode(&self) -> Result<ShareMode, DomainError> {
        ShareMode::parse(&self.mode)
    }
}

impl Store {
    /// 给一个节点开一条分享链接。token 由调用方生成（服务器那边有随机源）。
    pub async fn create_share(
        &self,
        actor: &Actor,
        node: NodeId,
        mode: ShareMode,
        token: &str,
    ) -> Result<Share, StoreError> {
        let mut tx = self.pool.begin().await?;
        let id = Uuid::now_v7();
        let share = sqlx::query_as!(
            Share,
            "insert into shares (id, node, token, mode) values ($1, $2, $3, $4)
             returning id, node, token, mode, created_at, revoked_at",
            id,
            node.0,
            token,
            mode.as_str(),
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(StoreError::from_db)?;
        trace(
            &mut tx,
            actor,
            "share.created",
            id,
            json!({ "node": node.0, "mode": mode.as_str() }),
        )
        .await?;
        tx.commit().await?;
        Ok(share)
    }

    /// 按 token 找一条还有效的链接。作废的和不存在的都是 NotFound。
    pub async fn find_share(&self, token: &str) -> Result<Share, StoreError> {
        sqlx::query_as!(
            Share,
            "select id, node, token, mode, created_at, revoked_at from shares
             where token = $1 and revoked_at is null",
            token,
        )
        .fetch_optional(&self.pool)
        .await?
        .ok_or(DomainError::NotFound.into())
    }

    /// 一个节点上的所有链接（含已作废的，界面上要能看出哪些失效了）。
    pub async fn list_shares(&self, node: NodeId) -> Result<Vec<Share>, StoreError> {
        Ok(sqlx::query_as!(
            Share,
            "select id, node, token, mode, created_at, revoked_at from shares
             where node = $1 order by created_at desc, id desc",
            node.0,
        )
        .fetch_all(&self.pool)
        .await?)
    }

    /// 作废一条链接。重复作废按不存在算。
    pub async fn revoke_share(&self, actor: &Actor, id: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let done = sqlx::query!(
            "update shares set revoked_at = now() where id = $1 and revoked_at is null",
            id,
        )
        .execute(&mut *tx)
        .await?;
        if done.rows_affected() == 0 {
            return Err(DomainError::NotFound.into());
        }
        trace(&mut tx, actor, "share.revoked", id, json!({})).await?;
        tx.commit().await?;
        Ok(())
    }
}
