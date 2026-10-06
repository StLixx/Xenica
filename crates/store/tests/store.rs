use xenica_core::{Actor, DomainError, NewEdge, NewNode, NodePatch};
use xenica_store::{PgPool, Store, StoreError};

fn node(title: &str) -> NewNode {
    NewNode {
        kind: None,
        title: title.into(),
        body: None,
    }
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn every_write_leaves_a_trace(pool: PgPool) {
    let store = Store::new(pool);
    let a = store
        .create_node(&Actor::User, node("秦统一六国"))
        .await
        .unwrap();
    store
        .update_node(
            &Actor::User,
            a.id,
            NodePatch {
                title: Some("秦灭六国".into()),
                body: None,
            },
        )
        .await
        .unwrap();
    store.delete_node(&Actor::User, a.id).await.unwrap();

    let actions: Vec<_> = store
        .list_traces(a.id.0)
        .await
        .unwrap()
        .into_iter()
        .map(|t| t.action)
        .collect();
    assert_eq!(actions, ["node.created", "node.updated", "node.deleted"]);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn traces_are_append_only(pool: PgPool) {
    let store = Store::new(pool.clone());
    store.create_node(&Actor::User, node("x")).await.unwrap();
    let res = sqlx::query("delete from traces").execute(&pool).await;
    assert!(res.is_err(), "deleting traces must fail");
    let res = sqlx::query("update traces set action = 'x'")
        .execute(&pool)
        .await;
    assert!(res.is_err(), "updating traces must fail");
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn deleting_a_node_removes_its_edges(pool: PgPool) {
    let store = Store::new(pool);
    let a = store.create_node(&Actor::User, node("a")).await.unwrap();
    let b = store.create_node(&Actor::User, node("b")).await.unwrap();
    store
        .create_edge(
            &Actor::User,
            NewEdge {
                source: a.id,
                target: b.id,
                kind: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(store.list_edges(Some(b.id), 100).await.unwrap().len(), 1);
    store.delete_node(&Actor::User, a.id).await.unwrap();
    assert!(store.list_edges(None, 100).await.unwrap().is_empty());
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn edge_errors_are_domain_errors(pool: PgPool) {
    let store = Store::new(pool);
    let a = store.create_node(&Actor::User, node("a")).await.unwrap();
    let b = store.create_node(&Actor::User, node("b")).await.unwrap();
    let missing = xenica_core::NodeId::new();
    let edge = |s, t| NewEdge {
        source: s,
        target: t,
        kind: None,
    };

    let err = store
        .create_edge(&Actor::User, edge(a.id, missing))
        .await
        .unwrap_err();
    assert!(matches!(err, StoreError::Domain(DomainError::NotFound)));

    store
        .create_edge(&Actor::User, edge(a.id, b.id))
        .await
        .unwrap();
    let err = store
        .create_edge(&Actor::User, edge(a.id, b.id))
        .await
        .unwrap_err();
    assert!(matches!(err, StoreError::Conflict(_)));
}
