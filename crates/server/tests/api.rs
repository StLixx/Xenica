use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use xenica_server::AppState;
use xenica_store::Store;

fn app(pool: PgPool) -> Router {
    xenica_server::app(
        AppState {
            store: Store::new(pool),
        },
        None,
    )
}

async fn call(app: &Router, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let req = Request::builder().method(method).uri(uri);
    let req = match body {
        Some(b) => req
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, json)
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn health_is_ok(pool: PgPool) {
    let (status, body) = call(&app(pool), "GET", "/api/health", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn node_lifecycle(pool: PgPool) {
    let app = app(pool);
    let (status, a) = call(
        &app,
        "POST",
        "/api/nodes",
        Some(json!({"title": " 秦统一六国 "})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(a["title"], "秦统一六国");
    assert_eq!(a["kind"], "note");
    let id = a["id"].as_str().unwrap();

    let (status, b) = call(
        &app,
        "PATCH",
        &format!("/api/nodes/{id}"),
        Some(json!({"title": "郡县制"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(b["title"], "郡县制");

    let (_, list) = call(&app, "GET", "/api/nodes", None).await;
    assert_eq!(list.as_array().unwrap().len(), 1);

    let (status, _) = call(&app, "DELETE", &format!("/api/nodes/{id}"), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, err) = call(&app, "GET", &format!("/api/nodes/{id}"), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(err["error"], "not_found");

    let (_, traces) = call(&app, "GET", &format!("/api/nodes/{id}/traces"), None).await;
    let actions: Vec<_> = traces
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["action"].as_str().unwrap())
        .collect();
    assert_eq!(actions, ["node.created", "node.updated", "node.deleted"]);
    assert_eq!(traces[0]["actor"]["type"], "user");
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn invalid_input_is_400(pool: PgPool) {
    let (status, err) = call(
        &app(pool),
        "POST",
        "/api/nodes",
        Some(json!({"title": "  "})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(err["error"], "invalid");
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn edges_between_nodes(pool: PgPool) {
    let app = app(pool);
    let (_, a) = call(&app, "POST", "/api/nodes", Some(json!({"title": "a"}))).await;
    let (_, b) = call(&app, "POST", "/api/nodes", Some(json!({"title": "b"}))).await;
    let edge = json!({"source": a["id"], "target": b["id"]});

    let (status, e) = call(&app, "POST", "/api/edges", Some(edge.clone())).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(e["kind"], "related");
    let (status, _) = call(&app, "POST", "/api/edges", Some(edge)).await;
    assert_eq!(status, StatusCode::CONFLICT);

    let (_, list) = call(
        &app,
        "GET",
        &format!("/api/edges?node={}", b["id"].as_str().unwrap()),
        None,
    )
    .await;
    assert_eq!(list.as_array().unwrap().len(), 1);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn unknown_api_path_is_json_404(pool: PgPool) {
    let (status, err) = call(&app(pool), "GET", "/api/nope", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(err["error"], "not_found");
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn demo_seed_loads_once(pool: PgPool) {
    let store = Store::new(pool.clone());
    let n = xenica_server::seed::seed_if_empty(&store, xenica_server::seed::DEMO)
        .await
        .unwrap();
    assert!(n > 20, "demo seed should have a real graph, got {n}");
    // 第二次不重复导入
    let again = xenica_server::seed::seed_if_empty(&store, xenica_server::seed::DEMO)
        .await
        .unwrap();
    assert_eq!(again, 0);
    let (_, edges) = call(&app(pool), "GET", "/api/edges", None).await;
    assert!(edges.as_array().unwrap().len() > 20);
}
