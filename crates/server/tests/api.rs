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
        Some(json!({"kind": "Not A Kind"})),
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
    assert!(n > 10, "demo seed should have a real page, got {n}");
    // 第二次不重复导入
    let again = xenica_server::seed::seed_if_empty(&store, xenica_server::seed::DEMO)
        .await
        .unwrap();
    assert_eq!(again, 0);
    let (_, edges) = call(&signed_in(pool).await, "GET", "/api/edges", None).await;
    assert!(edges.as_array().unwrap().len() > 20);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn blocks_live_in_order_inside_a_page(pool: PgPool) {
    let app = signed_in(pool).await;
    // 没有标题也能建
    let (status, page) = call(&app, "POST", "/api/nodes", Some(json!({}))).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(page["title"], "");
    let children = format!("/api/nodes/{}/children", page["id"].as_str().unwrap());

    let md = |s: &str| json!({"body": {"md": s}});
    let (status, made) = call(
        &app,
        "POST",
        &children,
        Some(json!({"nodes": [md("一"), md("三")]})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let (_, two) = call(
        &app,
        "POST",
        &children,
        Some(json!({"index": 1, "nodes": [md("二")]})),
    )
    .await;
    let texts = |list: &Value| -> Vec<String> {
        list.as_array()
            .unwrap()
            .iter()
            .map(|n| n["body"]["md"].as_str().unwrap().to_owned())
            .collect()
    };
    let (_, list) = call(&app, "GET", &children, None).await;
    assert_eq!(texts(&list), ["一", "二", "三"]);

    // 重排
    let order = json!([made[1]["id"], two[0]["id"], made[0]["id"]]);
    let (status, _) = call(&app, "PUT", &children, Some(order)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = call(&app, "GET", &children, None).await;
    assert_eq!(texts(&list), ["三", "二", "一"]);
    // 顺序里少了一个 = 冲突
    let (status, _) = call(&app, "PUT", &children, Some(json!([made[0]["id"]]))).await;
    assert_eq!(status, StatusCode::CONFLICT);

    // 删页连带删块
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/nodes/{}", page["id"].as_str().unwrap()),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/nodes/{}", made[0]["id"].as_str().unwrap()),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn tags_in_text_become_relations(pool: PgPool) {
    let app = signed_in(pool).await;
    let (_, a) = call(
        &app,
        "POST",
        "/api/nodes",
        Some(json!({"body": {"md": "$\\int \\sec x$ #必备 [[积分公式表]]"}})),
    )
    .await;
    let id = a["id"].as_str().unwrap();
    let mentioned = |edges: &Value| -> usize {
        edges
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["kind"] == "mentions" && e["source"] == id)
            .count()
    };
    let (_, edges) = call(&app, "GET", &format!("/api/edges?node={id}"), None).await;
    assert_eq!(mentioned(&edges), 2);
    let (_, nodes) = call(&app, "GET", "/api/nodes", None).await;
    let titles: Vec<&str> = nodes
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["title"].as_str().unwrap())
        .collect();
    assert!(titles.contains(&"必备") && titles.contains(&"积分公式表"));

    // 第二个块提到同一个标记：连到已有节点，不再新建
    call(
        &app,
        "POST",
        "/api/nodes",
        Some(json!({"body": {"md": "另一条 #必备"}})),
    )
    .await;
    let (_, nodes) = call(&app, "GET", "/api/nodes", None).await;
    let count = nodes
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["title"] == "必备")
        .count();
    assert_eq!(count, 1);

    // 去掉标记，关系跟着去掉
    call(
        &app,
        "PATCH",
        &format!("/api/nodes/{id}"),
        Some(json!({"body": {"md": "只剩 #必备"}})),
    )
    .await;
    let (_, edges) = call(&app, "GET", &format!("/api/edges?node={id}"), None).await;
    assert_eq!(mentioned(&edges), 1);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn images_upload_and_dedupe(pool: PgPool) {
    let (app, cookie) = signed_in(pool).await;
    let png: &[u8] = b"\x89PNG\r\n\x1a\nfake";
    let upload = |mime: &'static str| {
        Request::builder()
            .method("POST")
            .uri("/api/files")
            .header(header::COOKIE, &cookie)
            .header(header::CONTENT_TYPE, mime)
            .body(Body::from(png))
            .unwrap()
    };
    let res = app.clone().oneshot(upload("image/png")).await.unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let a: Value =
        serde_json::from_slice(&to_bytes(res.into_body(), 1 << 20).await.unwrap()).unwrap();
    let res = app.clone().oneshot(upload("image/png")).await.unwrap();
    let b: Value =
        serde_json::from_slice(&to_bytes(res.into_body(), 1 << 20).await.unwrap()).unwrap();
    assert_eq!(a["id"], b["id"]);
    let res = app.clone().oneshot(upload("text/html")).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    let url = a["url"].as_str().unwrap();
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(url)
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()[header::CONTENT_TYPE], "image/png");
    assert_eq!(&to_bytes(res.into_body(), 1 << 20).await.unwrap()[..], png);
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

/// 发请求，拿原始响应体（分享链接返回的是文字和图片，不是 JSON）。
async fn send_raw(
    app: &Router,
    cookie: Option<&str>,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, String, Vec<u8>) {
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
    let ctype = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap().to_vec();
    (status, ctype, bytes)
}

/// 一张草图：一个写着「侧栏」的框，加一张贴进去的图。
fn sketch_body(file: &str) -> Value {
    json!({
        "scene": {
            "type": "excalidraw",
            "elements": [
                { "id": "r1", "type": "rectangle", "x": 10.0, "y": 10.0, "width": 100.0, "height": 50.0 },
                { "id": "t1", "type": "text", "x": 20.0, "y": 20.0, "text": "侧栏", "containerId": "r1" },
                { "id": "i1", "type": "image", "x": 200.0, "y": 10.0, "width": 80.0, "height": 40.0,
                  "fileId": file }
            ]
        }
    })
}

async fn a_sketch(app: &(Router, String), file: &str) -> String {
    let (status, node) = call(
        app,
        "POST",
        "/api/nodes",
        Some(json!({ "kind": "sketch", "title": "验收板", "body": sketch_body(file) })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    node["id"].as_str().unwrap().to_owned()
}

async fn a_share(app: &(Router, String), node: &str, mode: &str) -> Value {
    let (status, share) = call(
        app,
        "POST",
        &format!("/api/nodes/{node}/shares"),
        Some(json!({ "mode": mode })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    share
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn a_share_link_is_readable_without_login(pool: PgPool) {
    let app = signed_in(pool).await;
    let id = a_sketch(&app, "00000000-0000-7000-8000-000000000000").await;
    let share = a_share(&app, &id, "read").await;
    let token = share["token"].as_str().unwrap().to_owned();
    assert!(
        share["url"]
            .as_str()
            .unwrap()
            .ends_with(&format!("/api/share/{token}")),
        "{share}"
    );

    // 不带 Cookie 也能读，拿到的是一段文字说明
    let (status, ctype, bytes) =
        send_raw(&app.0, None, "GET", &format!("/api/share/{token}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(ctype.starts_with("text/markdown"), "{ctype}");
    let text = String::from_utf8(bytes).unwrap();
    assert!(text.contains("# 验收板"), "{text}");
    assert!(text.contains("框「侧栏」"), "{text}");
    // 附件地址带上 token，AI 顺着就能取到原图
    assert!(
        text.contains(&format!("/api/share/{token}/files/")),
        "{text}"
    );

    // 原始画布数据也在
    let (status, _, bytes) = send_raw(
        &app.0,
        None,
        "GET",
        &format!("/api/share/{token}/scene.json"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let scene: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(scene["elements"].as_array().unwrap().len(), 3);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn only_a_write_link_can_change_the_scene(pool: PgPool) {
    let app = signed_in(pool).await;
    let id = a_sketch(&app, "00000000-0000-7000-8000-000000000001").await;
    let read = a_share(&app, &id, "read").await;
    let write = a_share(&app, &id, "write").await;

    let scene = json!({ "scene": { "type": "excalidraw", "elements": [
        { "id": "e1", "type": "ellipse", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0 }
    ] } });

    // 只读链接改不了
    let (status, _, _) = send_raw(
        &app.0,
        None,
        "PUT",
        &format!("/api/share/{}", read["token"].as_str().unwrap()),
        Some(scene.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // 可写链接能改，而且不用登录
    let (status, _, bytes) = send_raw(
        &app.0,
        None,
        "PUT",
        &format!("/api/share/{}", write["token"].as_str().unwrap()),
        Some(scene),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let node: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(node["body"]["scene"]["elements"][0]["type"], "ellipse");

    // 改完在链接上就读得到，而且 write 链接的说明里告诉 AI 怎么改
    let (_, _, bytes) = send_raw(
        &app.0,
        None,
        "GET",
        &format!("/api/share/{}", write["token"].as_str().unwrap()),
        None,
    )
    .await;
    let text = String::from_utf8(bytes).unwrap();
    assert!(text.contains("椭圆"), "{text}");
    assert!(text.contains("也可以改画面"), "{text}");
    assert!(
        !text.contains("画面图片："),
        "改过之后旧的图不该再给出：{text}"
    );
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn a_revoked_link_is_gone(pool: PgPool) {
    let app = signed_in(pool).await;
    let id = a_sketch(&app, "00000000-0000-7000-8000-000000000002").await;
    let share = a_share(&app, &id, "read").await;
    let token = share["token"].as_str().unwrap().to_owned();

    let (_, list) = call(&app, "GET", &format!("/api/nodes/{id}/shares"), None).await;
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(list[0]["revoked_at"], Value::Null);

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/shares/{}", share["id"].as_str().unwrap()),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, _, _) = send_raw(&app.0, None, "GET", &format!("/api/share/{token}"), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // 列表里还看得见，并且能看出它已经废了
    let (_, list) = call(&app, "GET", &format!("/api/nodes/{id}/shares"), None).await;
    assert!(list[0]["revoked_at"].is_string(), "{list}");
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn a_share_link_serves_the_pasted_image(pool: PgPool) {
    let (app, cookie) = signed_in(pool).await;
    let pair = (app.clone(), cookie.clone());
    let png: &[u8] = b"\x89PNG\r\n\x1a\nfake";
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/files")
                .header(header::COOKIE, &cookie)
                .header(header::CONTENT_TYPE, "image/png")
                .body(Body::from(png))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let file: Value =
        serde_json::from_slice(&to_bytes(res.into_body(), 1 << 20).await.unwrap()).unwrap();
    let file_id = file["id"].as_str().unwrap().to_owned();

    let id = a_sketch(&pair, &file_id).await;
    let share = a_share(&pair, &id, "read").await;
    let token = share["token"].as_str().unwrap();

    // 画面里用到的附件：不用登录就能取到原图，一个字节不差
    let (status, ctype, bytes) = send_raw(
        &pair.0,
        None,
        "GET",
        &format!("/api/share/{token}/files/{file_id}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(ctype, "image/png");
    assert_eq!(bytes, png);

    // 画面里没出现的文件取不到：光有 token 不能到处翻
    let other = uuid::Uuid::now_v7();
    let (status, _, _) = send_raw(
        &pair.0,
        None,
        "GET",
        &format!("/api/share/{token}/files/{other}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn managing_shares_needs_login(pool: PgPool) {
    let app = signed_in(pool).await;
    let id = a_sketch(&app, "00000000-0000-7000-8000-000000000003").await;

    let (status, _, _) = send(
        &app.0,
        None,
        "POST",
        &format!("/api/nodes/{id}/shares"),
        Some(json!({ "mode": "read" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _, _) = send(
        &app.0,
        None,
        "GET",
        &format!("/api/nodes/{id}/shares"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    // 公开的是 `/api/share/`（单数），管理用的 `/api/shares/`（复数）要登录
    let (status, _, _) = send(
        &app.0,
        None,
        "DELETE",
        &format!("/api/shares/{}", uuid::Uuid::now_v7()),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrator = "xenica_store::MIGRATOR")]
async fn probe_image_is_public_png(pool: PgPool) {
    // 探针要给外部站点直接内嵌：不带 Cookie 也能拿到图，且必须声明成 image/png。
    let res = app(pool)
        .oneshot(
            Request::builder()
                .uri("/api/probe/png")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers()
            .get(header::CONTENT_TYPE)
            .unwrap()
            .to_str()
            .unwrap(),
        "image/png"
    );
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
}
