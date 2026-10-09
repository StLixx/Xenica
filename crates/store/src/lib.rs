//! PostgreSQL 存储层。
//!
//! 约定（新加方法时照做）：
//! - 读：直接查询，返回领域类型。
//! - 写：开事务 → 改数据 → `trace()` 记一条痕迹 → 提交。没有不写痕迹的写操作。
//! - SQL 用 `sqlx::query!` 系列宏，编译期检查；改了 SQL 要运行 `cargo sqlx prepare --workspace`。

mod auth;
mod edges;
mod error;
mod files;
mod nodes;
mod traces;

pub use error::StoreError;
pub use files::StoredFile;
pub use sqlx::PgPool;

use sqlx::{Postgres, Transaction};
use xenica_core::{Actor, TraceId};

/// 数据库迁移，启动时自动执行。
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[derive(Clone)]
pub struct Store {
    pool: PgPool,
}

impl Store {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn connect(database_url: &str) -> Result<Self, StoreError> {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;
        Ok(Self::new(pool))
    }

    pub async fn migrate(&self) -> Result<(), StoreError> {
        MIGRATOR.run(&self.pool).await?;
        Ok(())
    }

    pub async fn ping(&self) -> Result<(), StoreError> {
        sqlx::query("select 1").execute(&self.pool).await?;
        Ok(())
    }
}

/// 在事务内追加一条痕迹。
async fn trace(
    tx: &mut Transaction<'_, Postgres>,
    actor: &Actor,
    action: &str,
    subject: uuid::Uuid,
    detail: serde_json::Value,
) -> Result<(), StoreError> {
    sqlx::query!(
        "insert into traces (id, actor, action, subject, detail) values ($1, $2, $3, $4, $5)",
        TraceId::new().0,
        actor.to_storage(),
        action,
        subject,
        detail,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}
