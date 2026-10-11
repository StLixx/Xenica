use chrono::{Duration, Utc};
use xenica_core::{Actor, UserId};
use xenica_store::{PgPool, Store};

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn runtime_capacity_generation_and_idle_release(pool: PgPool) {
    let store = Store::new(pool.clone());
    let actor = Actor::User { id: None };
    let a = store
        .start_runtime(&actor, "v1", "image1", "snapshot1")
        .await
        .unwrap();
    let again = store
        .start_runtime(&actor, "v1", "image1", "snapshot1")
        .await
        .unwrap();
    assert_eq!(a.id, again.id);
    assert_eq!(a.generation, again.generation);
    store
        .start_runtime(&actor, "v2", "image2", "snapshot2")
        .await
        .unwrap();
    assert!(
        store
            .start_runtime(&actor, "v3", "image3", "snapshot3")
            .await
            .is_err()
    );
    store
        .runtime_state(&actor, a.id, 1, "running", "")
        .await
        .unwrap();
    assert!(
        store
            .start_runtime(&actor, "v1", "changed", "snapshot1")
            .await
            .is_err()
    );
    // 时钟移动只用于数据库测试，真实状态写入仍经 Store。
    sqlx::query("update development_runtimes set touched_at=$1 where id=$2")
        .bind(Utc::now() - Duration::minutes(16))
        .bind(a.id)
        .execute(&pool)
        .await
        .unwrap();
    store.expire_runtimes(&actor).await.unwrap();
    assert!(
        store
            .start_runtime(&actor, "v1", "image1", "snapshot1")
            .await
            .is_err()
    );
    store
        .runtime_state(&actor, a.id, 1, "stopped", "")
        .await
        .unwrap();
    let b = store
        .start_runtime(&actor, "v1", "image1", "snapshot1")
        .await
        .unwrap();
    assert_eq!(b.generation, 2);
    assert!(
        store
            .runtime_state(&actor, a.id, 1, "running", "")
            .await
            .is_err()
    );
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn bridge_is_single_use_bound_to_runtime_and_generation(pool: PgPool) {
    let store = Store::new(pool);
    let actor = Actor::User { id: None };
    let user = store
        .create_user(None, "tester", "unused hash")
        .await
        .unwrap();
    let r = store
        .start_runtime(&actor, "v1", "image1", "snapshot1")
        .await
        .unwrap();
    assert!(
        store
            .runtime_ticket(&actor, user.id, r.id, b"ticket")
            .await
            .is_err()
    );
    store
        .runtime_state(&actor, r.id, 1, "running", "")
        .await
        .unwrap();
    store
        .runtime_ticket(&Actor::user(UserId(user.id.0)), user.id, r.id, b"ticket")
        .await
        .unwrap();
    assert!(
        store
            .exchange_runtime_ticket(uuid::Uuid::now_v7(), b"ticket", b"session")
            .await
            .is_err()
    );
    store
        .exchange_runtime_ticket(r.id, b"ticket", b"session")
        .await
        .unwrap();
    assert!(
        store
            .exchange_runtime_ticket(r.id, b"ticket", b"another")
            .await
            .is_err()
    );
    assert!(store.touch_runtime_session(r.id, b"session").await.unwrap());
    assert!(!store.touch_runtime_session(r.id, b"wrong").await.unwrap());
    store
        .runtime_state(&actor, r.id, 1, "stopping", "")
        .await
        .unwrap();
    assert!(!store.touch_runtime_session(r.id, b"session").await.unwrap());
}
