use xenica_core::{Actor, Trace, TraceId};

use crate::{Store, StoreError};

impl Store {
    /// 某个节点或关系的全部痕迹，按时间先后。
    pub async fn list_traces(&self, subject: uuid::Uuid) -> Result<Vec<Trace>, StoreError> {
        let rows = sqlx::query!(
            r#"select id, at, actor, action, subject, detail
               from traces where subject = $1 order by at, id"#,
            subject,
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|r| {
                let actor = Actor::from_storage(&r.actor).ok_or_else(|| {
                    StoreError::Database(sqlx::Error::Decode(
                        format!("unknown actor {:?}", r.actor).into(),
                    ))
                })?;
                Ok(Trace {
                    id: TraceId(r.id),
                    at: r.at,
                    actor,
                    action: r.action,
                    subject: r.subject,
                    detail: r.detail,
                })
            })
            .collect()
    }
}
