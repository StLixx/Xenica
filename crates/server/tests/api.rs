use std::sync::Arc;

use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use xenica_server::{AppState, Auth};
use xenica_store::Store;

const CODE: &str = "TEST-CODE";

fn app(pool: PgPool) -> Router {
    xenica_server::app(
        AppState {
            store: Store::new(pool),
            auth: Arc::new(Auth::new(Some(CODE.into()), false)),
        },
        None,
    )
}

/// 发请求。`cookie` 为空 = 没登录。返回状态码、JSON 和 Set-Cookie 里的会话（若有）。
async fn send(
    app: &Router,
    cookie: Option<&str>,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value, Option<String>) {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(c) = cookie {
        req = req.header(header::COOKIE, c);
    }
    let req = match body {
        Some(b) => req
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let set_cookie = res
        .headers()
        .get(header::SET_COOKIE)
        .map(|v| v.to_str().unwrap().split(';').next().unwrap().to_owned());
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, json, set_cookie)
}

/// 用设置码建第一个账号，返回登录后的 Cookie。
async fn sign_up(app: &Router) -> String {
    let (status, _, cookie) = send(
        app,
        None,
        "POST",
        "/api/auth/setup",
        Some(json!({"code": CODE, "name": "lixx", "password": "correct horse"})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    cookie.expect("session cookie")
}

/// 已登录的应用。
async fn signed_in(pool: PgPool) -> (Router, String) {
    let app = app(pool);
    let cookie = sign_up(&app).await;
    (app, cookie)
}

async fn call(
    (app, cookie): &(Router, String),
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let (status, json, _) = send(app, Some(cookie), method, uri, body).await;
    (status, json)
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn health_is_ok(pool: PgPool) {
    let (status, body, _) = send(&app(pool), None, "GET", "/api/health", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn node_lifecycle(pool: PgPool) {
    let app = signed_in(pool).await;
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
    assert!(
        traces[0]["actor"]["id"].is_string(),
        "trace records which user"
    );
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn invalid_input_is_400(pool: PgPool) {
    let (status, err) = call(
        &signed_in(pool).await,
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
    let app = signed_in(pool).await;
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
    let (status, err) = call(&signed_in(pool).await, "GET", "/api/nope", None).await;
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
    let (_, edges) = call(&signed_in(pool).await, "GET", "/api/edges", None).await;
    assert!(edges.as_array().unwrap().len() > 20);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn api_requires_login(pool: PgPool) {
    let app = app(pool);
    for (method, uri) in [
        ("GET", "/api/nodes"),
        ("POST", "/api/nodes"),
        ("GET", "/api/edges"),
        ("GET", "/api/nope"),
    ] {
        let (status, err, _) = send(&app, None, method, uri, Some(json!({"title": "x"}))).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{method} {uri}");
        assert_eq!(err["error"], "unauthorized");
    }
    let (status, _, _) = send(
        &app,
        Some("xenica_session=forged"),
        "GET",
        "/api/nodes",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    // 静态页面不需要登录（没有构建前端时是 404，而不是 401）
    let (status, _, _) = send(&app, None, "GET", "/", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn setup_code_works_once(pool: PgPool) {
    let app = app(pool);
    let (_, s, _) = send(&app, None, "GET", "/api/auth/session", None).await;
    assert_eq!(s["setup_required"], true);
    assert_eq!(s["user"], Value::Null);

    let body =
        |code: &str| Some(json!({"code": code, "name": "lixx", "password": "correct horse"}));
    let (status, err, _) = send(&app, None, "POST", "/api/auth/setup", body("WRONG-CODE")).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(err["error"], "forbidden");
    let (status, _, _) = send(
        &app,
        None,
        "POST",
        "/api/auth/setup",
        Some(json!({"code": CODE, "name": "lixx", "password": "short"})),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "weak password does not use up the code"
    );

    let cookie = sign_up(&app).await;
    let (_, s, _) = send(&app, Some(&cookie), "GET", "/api/auth/session", None).await;
    assert_eq!(s["user"]["name"], "lixx");
    assert_eq!(s["setup_required"], false);

    let (status, _, _) = send(&app, None, "POST", "/api/auth/setup", body(CODE)).await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn login_logout_and_lockout(pool: PgPool) {
    let app = app(pool);
    sign_up(&app).await;
    let login = |password: &str| Some(json!({"name": "LIXX", "password": password}));

    let (status, user, cookie) = send(
        &app,
        None,
        "POST",
        "/api/auth/login",
        login("correct horse"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(user["name"], "lixx");
    assert!(user.get("password_hash").is_none());
    let cookie = cookie.unwrap();
    let (status, _, _) = send(&app, Some(&cookie), "GET", "/api/nodes", None).await;
    assert_eq!(status, StatusCode::OK);

    // 退出后这个会话就失效了
    let (status, _, cleared) = send(&app, Some(&cookie), "POST", "/api/auth/logout", None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(cleared.as_deref(), Some("xenica_session="));
    let (status, _, _) = send(&app, Some(&cookie), "GET", "/api/nodes", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // 连续输错 5 次，第 6 次即使密码对也被锁
    for _ in 0..5 {
        let (status, err, _) =
            send(&app, None, "POST", "/api/auth/login", login("nope nope")).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(err["error"], "unauthorized");
    }
    let (status, err, _) = send(
        &app,
        None,
        "POST",
        "/api/auth/login",
        login("correct horse"),
    )
    .await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(err["error"], "locked");

    // 不存在的用户名同样是 401
    let (status, _, _) = send(
        &app,
        None,
        "POST",
        "/api/auth/login",
        Some(json!({"name": "nobody", "password": "whatever1"})),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn cross_site_writes_are_rejected(pool: PgPool) {
    let (app, cookie) = signed_in(pool).await;
    let req = |origin: &str| {
        Request::builder()
            .method("POST")
            .uri("/api/nodes")
            .header(header::HOST, "xenica.truebigsand.top")
            .header(header::ORIGIN, origin)
            .header(header::COOKIE, &cookie)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(json!({"title": "x"}).to_string()))
            .unwrap()
    };
    let res = app
        .clone()
        .oneshot(req("https://pr-9.xenica.truebigsand.top"))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
    let res = app
        .clone()
        .oneshot(req("https://xenica.truebigsand.top"))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn demo_user_can_log_in(pool: PgPool) {
    let store = Store::new(pool.clone());
    assert!(xenica_server::seed::ensure_demo_user(&store).await.unwrap());
    assert!(!xenica_server::seed::ensure_demo_user(&store).await.unwrap());
    let state = AppState::new(store, true).await.unwrap();
    assert_eq!(
        state.auth.setup_code(),
        None,
        "no setup code once a user exists"
    );
    let app = xenica_server::app(state, None);
    let (_, s, _) = send(&app, None, "GET", "/api/auth/session", None).await;
    assert_eq!(s["demo"], true);
    assert_eq!(s["setup_required"], false);
    let (status, _, _) = send(
        &app,
        None,
        "POST",
        "/api/auth/login",
        Some(json!({"name": "demo", "password": "demo"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}
