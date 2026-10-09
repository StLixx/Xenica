use xenica_core::{Actor, DomainError, NewNode, NodeId, ShareMode};
use xenica_store::{PgPool, Store, StoreError};

const ME: Actor = Actor::User { id: None };

fn node(title: &str) -> NewNode {
    NewNode {
        id: None,
        kind: None,
        title: title.into(),
        body: None,
    }
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn share_lifecycle(pool: PgPool) {
    let store = Store::new(pool);
    let page = store.create_node(&ME, node("草图")).await.unwrap();

    let share = store
        .create_share(&ME, page.id, ShareMode::Read, "tok-read")
        .await
        .unwrap();
    assert_eq!(share.mode().unwrap(), ShareMode::Read);
    assert_eq!(share.mode, "read");
    assert!(share.revoked_at.is_none());
    assert_eq!(store.find_share("tok-read").await.unwrap().id, share.id);

    // 同一个 token 不能重复开
    let err = store
        .create_share(&ME, page.id, ShareMode::Read, "tok-read")
        .await
        .unwrap_err();
    assert!(matches!(err, StoreError::Conflict(_)), "{err:?}");

    // 一个节点可以同时有只读和可写两条
    let write = store
        .create_share(&ME, page.id, ShareMode::Write, "tok-write")
        .await
        .unwrap();
    assert_eq!(write.mode().unwrap(), ShareMode::Write);
    assert_eq!(store.list_shares(page.id).await.unwrap().len(), 2);

    // 作废之后就读不到了，但列表里还看得见它已失效
    store.revoke_share(&ME, share.id).await.unwrap();
    let err = store.find_share("tok-read").await.unwrap_err();
    assert!(
        matches!(err, StoreError::Domain(DomainError::NotFound)),
        "{err:?}"
    );
    let listed = store.list_shares(page.id).await.unwrap();
    assert_eq!(listed.len(), 2);
    assert!(
        listed
            .iter()
            .any(|s| s.id == share.id && s.revoked_at.is_some())
    );

    // 重复作废按不存在算
    let err = store.revoke_share(&ME, share.id).await.unwrap_err();
    assert!(
        matches!(err, StoreError::Domain(DomainError::NotFound)),
        "{err:?}"
    );

    // 痕迹：开一条、作废一条
    let actions: Vec<_> = store
        .list_traces(share.id)
        .await
        .unwrap()
        .into_iter()
        .map(|t| t.action)
        .collect();
    assert_eq!(actions, ["share.created", "share.revoked"]);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn share_on_a_missing_node_is_not_found(pool: PgPool) {
    let store = Store::new(pool);
    let err = store
        .create_share(&ME, NodeId::new(), ShareMode::Read, "t")
        .await
        .unwrap_err();
    assert!(
        matches!(err, StoreError::Domain(DomainError::NotFound)),
        "{err:?}"
    );
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn deleting_a_node_removes_its_shares(pool: PgPool) {
    let store = Store::new(pool);
    let page = store.create_node(&ME, node("草图")).await.unwrap();
    store
        .create_share(&ME, page.id, ShareMode::Read, "t1")
        .await
        .unwrap();
    store.delete_node(&ME, page.id).await.unwrap();
    let err = store.find_share("t1").await.unwrap_err();
    assert!(
        matches!(err, StoreError::Domain(DomainError::NotFound)),
        "{err:?}"
    );
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn unknown_token_is_not_found(pool: PgPool) {
    let store = Store::new(pool);
    let err = store.find_share("nope").await.unwrap_err();
    assert!(
        matches!(err, StoreError::Domain(DomainError::NotFound)),
        "{err:?}"
    );
}
