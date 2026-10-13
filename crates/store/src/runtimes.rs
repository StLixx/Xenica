use crate::{Store, StoreError, trace};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;
use xenica_core::{Actor, DomainError, UserId};

#[derive(Clone, Debug, Serialize)]
pub struct DevelopmentRuntime {
    pub id: Uuid,
    pub version: String,
    pub artifact: String,
    pub snapshot: String,
    pub generation: i64,
    pub state: String,
    pub message: String,
    pub touched_at: DateTime<Utc>,
}

fn runtime(r: sqlx::postgres::PgRow) -> DevelopmentRuntime {
    DevelopmentRuntime {
        id: r.get("id"),
        version: r.get("version"),
        artifact: r.get("artifact"),
        snapshot: r.get("snapshot"),
        generation: r.get("generation"),
        state: r.get("state"),
        message: r.get("message"),
        touched_at: r.get("touched_at"),
    }
}

impl Store {
    pub async fn check_runtime_session(&self, id: Uuid, hash: &[u8]) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar("select exists(select 1 from runtime_grants g join development_runtimes r on r.id=g.runtime where g.runtime=$1 and g.token_hash=$2 and g.session and g.expires_at>now() and r.generation=g.generation and r.state='running')")
            .bind(id).bind(hash).fetch_one(&self.pool).await?)
    }
    pub async fn development_runtimes(&self) -> Result<Vec<DevelopmentRuntime>, StoreError> {
        Ok(
            sqlx::query("select * from development_runtimes order by version")
                .fetch_all(&self.pool)
                .await?
                .into_iter()
                .map(runtime)
                .collect(),
        )
    }

    /// 全局锁保护容量；相同版本与身份的请求幂等，旧代次不能写回新实例。
    pub async fn start_runtime(
        &self,
        actor: &Actor,
        version: &str,
        artifact: &str,
        snapshot: &str,
    ) -> Result<DevelopmentRuntime, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("select pg_advisory_xact_lock(2026101125)")
            .execute(&mut *tx)
            .await?;
        let old = sqlx::query("select * from development_runtimes where version=$1 for update")
            .bind(version)
            .fetch_optional(&mut *tx)
            .await?
            .map(runtime);
        if let Some(ref r) = old
            && matches!(r.state.as_str(), "preparing" | "running" | "stopping")
        {
            if r.artifact != artifact || r.snapshot != snapshot || r.state == "stopping" {
                return Err(StoreError::Conflict(
                    "版本正在释放或档案身份变化，请稍后再试".into(),
                ));
            }
            sqlx::query("update development_runtimes set touched_at=now() where id=$1")
                .bind(r.id)
                .execute(&mut *tx)
                .await?;
            trace(
                &mut tx,
                actor,
                "runtime.touched",
                r.id,
                json!({"generation":r.generation}),
            )
            .await?;
            tx.commit().await?;
            return Ok(r.clone());
        }
        let count: i64=sqlx::query_scalar("select count(*) from development_runtimes where state in ('preparing','running','stopping')")
            .fetch_one(&mut *tx).await?;
        if count >= 2 {
            return Err(StoreError::Conflict(
                "最多同时运行两个历史版本，请等待空闲实例释放".into(),
            ));
        }
        let id = old.as_ref().map(|r| r.id).unwrap_or_else(Uuid::now_v7);
        let row=sqlx::query("insert into development_runtimes(id,version,artifact,snapshot,state) values($1,$2,$3,$4,'preparing') on conflict(version) do update set artifact=$3,snapshot=$4,state='preparing',message='',generation=development_runtimes.generation+1,touched_at=now(),updated_at=now() returning *")
            .bind(id).bind(version).bind(artifact).bind(snapshot).fetch_one(&mut *tx).await?;
        let result = runtime(row);
        trace(&mut tx,actor,"runtime.requested",id,json!({"version":version,"artifact":artifact,"snapshot":snapshot,"generation":result.generation})).await?;
        tx.commit().await?;
        Ok(result)
    }

    pub async fn runtime_state(
        &self,
        actor: &Actor,
        id: Uuid,
        generation: i64,
        state: &str,
        message: &str,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query(
            "select state from development_runtimes where id=$1 and generation=$2 for update",
        )
        .bind(id)
        .bind(generation)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(DomainError::NotFound)?;
        let old: String = row.get("state");
        if !matches!(
            (old.as_str(), state),
            ("preparing", "running" | "failed" | "stopping")
                | ("running", "stopping" | "failed")
                | ("stopping", "stopped" | "failed")
        ) {
            return Err(StoreError::Conflict("无效运行状态变更".into()));
        }
        sqlx::query("update development_runtimes set state=$3,message=$4,updated_at=now() where id=$1 and generation=$2")
            .bind(id).bind(generation).bind(state).bind(message).execute(&mut *tx).await?;
        trace(
            &mut tx,
            actor,
            "runtime.state",
            id,
            json!({"generation":generation,"state":state,"message":message}),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// 释放前再次检查触达时间；触达与过期不能互相穿越。
    pub async fn expire_runtimes(&self, actor: &Actor) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let rows=sqlx::query("update development_runtimes set state='stopping',updated_at=now() where state in ('preparing','running') and touched_at < now()-interval '15 minutes' returning id,generation")
            .fetch_all(&mut *tx).await?;
        for r in rows {
            let id: Uuid = r.get("id");
            let generation: i64 = r.get("generation");
            trace(
                &mut tx,
                actor,
                "runtime.expired",
                id,
                json!({"generation":generation}),
            )
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn runtime_ticket(
        &self,
        actor: &Actor,
        user: UserId,
        id: Uuid,
        hash: &[u8],
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let generation:Option<i64>=sqlx::query_scalar("update development_runtimes set touched_at=now() where id=$1 and state='running' returning generation")
            .bind(id).fetch_optional(&mut *tx).await?;
        let generation = generation.ok_or_else(|| StoreError::Conflict("版本尚未准备好".into()))?;
        sqlx::query("insert into runtime_grants(token_hash,runtime,generation,user_id,expires_at) values($1,$2,$3,$4,now()+interval '60 seconds')")
            .bind(hash).bind(id).bind(generation).bind(user.0).execute(&mut *tx).await?;
        trace(
            &mut tx,
            actor,
            "runtime.authorized",
            id,
            json!({"generation":generation}),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn exchange_runtime_ticket(
        &self,
        id: Uuid,
        ticket: &[u8],
        session: &[u8],
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let row=sqlx::query("update runtime_grants g set consumed=true from development_runtimes r where g.runtime=r.id and r.id=$1 and g.token_hash=$2 and not g.consumed and not g.session and g.expires_at>now() and g.generation=r.generation and r.state='running' returning g.user_id,g.generation")
            .bind(id).bind(ticket).fetch_optional(&mut *tx).await?.ok_or(DomainError::NotFound)?;
        let user: Uuid = row.get("user_id");
        let generation: i64 = row.get("generation");
        sqlx::query("insert into runtime_grants(token_hash,runtime,generation,user_id,expires_at,session) values($1,$2,$3,$4,now()+interval '15 minutes',true)")
            .bind(session).bind(id).bind(generation).bind(user).execute(&mut *tx).await?;
        trace(
            &mut tx,
            &Actor::user(UserId(user)),
            "runtime.bridge",
            id,
            json!({"generation":generation}),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn touch_runtime_session(&self, id: Uuid, hash: &[u8]) -> Result<bool, StoreError> {
        let mut tx = self.pool.begin().await?;
        let row=sqlx::query("select g.user_id from runtime_grants g join development_runtimes r on r.id=g.runtime where g.runtime=$1 and g.token_hash=$2 and g.session and g.expires_at>now() and r.generation=g.generation and r.state='running' for update of r,g")
            .bind(id).bind(hash).fetch_optional(&mut *tx).await?;
        let Some(row) = row else { return Ok(false) };
        let user: Uuid = row.get("user_id");
        sqlx::query(
            "update runtime_grants set expires_at=now()+interval '15 minutes' where token_hash=$1",
        )
        .bind(hash)
        .execute(&mut *tx)
        .await?;
        sqlx::query("update development_runtimes set touched_at=now() where id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        trace(
            &mut tx,
            &Actor::user(UserId(user)),
            "runtime.activity",
            id,
            json!({}),
        )
        .await?;
        tx.commit().await?;
        Ok(true)
    }
}
