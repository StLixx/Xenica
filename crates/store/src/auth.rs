use chrono::{DateTime, Utc};
use serde_json::json;
use uuid::Uuid;
use xenica_core::{Actor, User, UserId};

use crate::{Store, StoreError, trace};

struct UserRow {
    id: Uuid,
    name: String,
    created_at: DateTime<Utc>,
}

impl From<UserRow> for User {
    fn from(r: UserRow) -> Self {
        User {
            id: UserId(r.id),
            name: r.name,
            created_at: r.created_at,
        }
    }
}

/// 账号和会话。密码哈希、令牌哈希由 server 算好传进来；这里不碰明文。
impl Store {
    pub async fn count_users(&self) -> Result<i64, StoreError> {
        let n = sqlx::query_scalar!(r#"select count(*) as "n!" from users"#)
            .fetch_one(&self.pool)
            .await?;
        Ok(n)
    }

    /// 新建账号。`actor` 为空时记成新账号自己（首次设置）。用户名已存在 → `Conflict`。
    pub async fn create_user(
        &self,
        actor: Option<&Actor>,
        name: &str,
        password_hash: &str,
    ) -> Result<User, StoreError> {
        let id = UserId::new();
        let mut tx = self.pool.begin().await?;
        let user: User = sqlx::query_as!(
            UserRow,
            r#"insert into users (id, name, password_hash) values ($1, $2, $3)
               returning id, name, created_at"#,
            id.0,
            name,
            password_hash,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(StoreError::from_db)?
        .into();
        let me = Actor::user(id);
        trace(
            &mut tx,
            actor.unwrap_or(&me),
            "user.created",
            id.0,
            json!({ "name": user.name }),
        )
        .await?;
        tx.commit().await?;
        Ok(user)
    }

    /// 按用户名（不分大小写）找账号，连同密码哈希。
    pub async fn find_user_by_name(
        &self,
        name: &str,
    ) -> Result<Option<(User, String)>, StoreError> {
        let row = sqlx::query!(
            "select id, name, password_hash, created_at from users where lower(name) = lower($1)",
            name,
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| {
            (
                User {
                    id: UserId(r.id),
                    name: r.name,
                    created_at: r.created_at,
                },
                r.password_hash,
            )
        }))
    }

    /// 登录：新建会话，顺手清掉这个账号已过期的会话。
    pub async fn create_session(
        &self,
        user: UserId,
        token_hash: &[u8],
        expires_at: DateTime<Utc>,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query!(
            "delete from sessions where user_id = $1 and expires_at <= now()",
            user.0
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)",
            token_hash,
            user.0,
            expires_at,
        )
        .execute(&mut *tx)
        .await?;
        trace(
            &mut tx,
            &Actor::user(user),
            "session.created",
            user.0,
            json!({}),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// 会话对应的账号；不存在或已过期返回 `None`。
    pub async fn session_user(&self, token_hash: &[u8]) -> Result<Option<User>, StoreError> {
        let row = sqlx::query_as!(
            UserRow,
            r#"select u.id, u.name, u.created_at
               from sessions s join users u on u.id = s.user_id
               where s.token_hash = $1 and s.expires_at > now()"#,
            token_hash,
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(User::from))
    }

    /// 退出登录。会话不存在也算成功。
    pub async fn delete_session(&self, token_hash: &[u8]) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let user = sqlx::query_scalar!(
            "delete from sessions where token_hash = $1 returning user_id",
            token_hash
        )
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(user) = user {
            trace(
                &mut tx,
                &Actor::user(UserId(user)),
                "session.deleted",
                user,
                json!({}),
            )
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
}
