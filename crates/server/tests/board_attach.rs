use serde_json::json;
use xenica_core::{Actor,NewNode};
use xenica_store::{Store,PgPool};

#[sqlx::test(migrator="xenica_store::MIGRATOR")]
async fn attach_is_additive_idempotent_and_keeps_original(pool:PgPool) {
    let store=Store::new(pool);let actor=Actor::User{id:None};
    let raw=json!({"scene":{"elements":[{"id":"raw","type":"text","text":"用户原文","x":17,"y":23},{"id":"frame","type":"rectangle","boundElements":[{"id":"raw","type":"text"}]}]}});
    let source=store.create_node(&actor,NewNode{id:None,kind:Some("sketch".into()),title:"原件".into(),body:Some(raw.clone())}).await.unwrap();
    let board=store.development_board(&actor).await.unwrap();
    let attached=xenica_server::archive::attach_to_board(&store,source.id).await.unwrap();
    assert_eq!(attached.id,board.id);
    let elements=attached.body["scene"]["elements"].as_array().unwrap();
    assert_eq!(elements.len(),2);assert_eq!(elements[0]["text"],"用户原文");
    assert_eq!(elements[0]["x"],17);assert_eq!(elements[1]["boundElements"][0]["id"],elements[0]["id"]);
    assert_eq!(store.get_node(source.id).await.unwrap().body,raw);
    assert_eq!(xenica_server::archive::attach_to_board(&store,source.id).await.unwrap().body,attached.body);
}
