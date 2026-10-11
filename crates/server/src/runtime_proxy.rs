//! 隔离域名上的会话桥。没有 Docker 权限；转发范围由部署器固定，不能由请求指定。
use axum::{body::{Body,to_bytes},extract::{Query,Request,State},http::{header,HeaderValue,StatusCode},response::{IntoResponse,Redirect,Response},Router,routing::get};
use serde::Deserialize;
use uuid::Uuid;
use crate::{ApiError,auth::{new_token,token_hash}};
use xenica_store::Store;
#[derive(Clone)]
struct Proxy {store:Store,id:Uuid,host:String,upstream:String,cookie:String,client:reqwest::Client}
#[derive(Deserialize)]
struct Ticket {ticket:String}
async fn bridge(State(p):State<Proxy>,Query(t):Query<Ticket>,req:Request)->Result<Response,ApiError> {
    if req.headers().get(header::HOST).and_then(|v|v.to_str().ok())!=Some(&p.host) {return Err(ApiError::forbidden("运行入口不匹配"))}
    let session=new_token();
    p.store.exchange_runtime_ticket(p.id,&token_hash(&t.ticket),&token_hash(&session)).await.map_err(|_|ApiError::unauthorized())?;
    let mut response=Redirect::to("/").into_response();
    response.headers_mut().insert(header::SET_COOKIE,HeaderValue::from_str(&format!("xenica_runtime={session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900")).map_err(|_|ApiError::internal())?);
    response.headers_mut().insert(header::CACHE_CONTROL,HeaderValue::from_static("no-store"));
    response.headers_mut().insert(header::REFERRER_POLICY,HeaderValue::from_static("no-referrer"));
    Ok(response)
}
async fn proxy(State(p):State<Proxy>,req:Request)->Result<Response,ApiError> {
    if req.headers().get(header::HOST).and_then(|v|v.to_str().ok())!=Some(&p.host) {return Err(ApiError::forbidden("运行入口不匹配"))}
    if let Some(origin)=req.headers().get(header::ORIGIN) {
        if origin.to_str().ok()!=Some(&format!("https://{}",p.host)) {return Err(ApiError::forbidden("跨站请求被拒绝"))}
    }
    let token=req.headers().get_all(header::COOKIE).iter().filter_map(|v|v.to_str().ok()).flat_map(|v|v.split(';'))
        .find_map(|s|s.trim().strip_prefix("xenica_runtime=")).ok_or_else(ApiError::unauthorized)?;
    if !p.store.check_runtime_session(p.id,&token_hash(token)).await? {return Err(ApiError::unauthorized())}
    let path=req.uri().path_and_query().map(|v|v.as_str()).unwrap_or("/");
    if req.uri().path()=="/__activity" {
        if req.method()!=axum::http::Method::POST || req.headers().get(header::ORIGIN).and_then(|v|v.to_str().ok())!=Some(&format!("https://{}",p.host)) {return Err(ApiError::forbidden("活动来源不匹配"))}
        if !p.store.touch_runtime_session(p.id,&token_hash(token)).await? {return Err(ApiError::unauthorized())}
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    if req.uri().path().starts_with("/api/auth/") && req.method()!=axum::http::Method::GET {return Err(ApiError::forbidden("历史体验使用画板的限定授权"))}
    if path.starts_with("/api/development/") || path.starts_with("/__bridge") {return Err(ApiError::forbidden("此入口仅用于体验历史版本"))}
    let mut upstream=p.client.request(req.method().clone(),format!("{}{path}",p.upstream));
    for (k,v) in req.headers() {
        if !matches!(k.as_str(),"cookie"|"host"|"origin"|"referer"|"connection"|"content-length"|"transfer-encoding"|"authorization") {upstream=upstream.header(k,v);}
    }
    let body=to_bytes(req.into_body(),32*1024*1024).await.map_err(|_|ApiError::new(StatusCode::PAYLOAD_TOO_LARGE,"invalid","内容过大"))?;
    let remote=upstream.header(header::COOKIE,format!("xenica_session={}",p.cookie)).body(body).send().await.map_err(|_|ApiError::new(StatusCode::BAD_GATEWAY,"unavailable","历史版本暂时无法连接"))?;
    let status=remote.status(); let headers=remote.headers().clone();
    let data=remote.bytes().await.map_err(|_|ApiError::internal())?;
    let data=if headers.get(header::CONTENT_TYPE).and_then(|h|h.to_str().ok()).is_some_and(|h|h.starts_with("text/html")) {
        let html=String::from_utf8(data.to_vec()).map_err(|_|ApiError::internal())?;
        // 自动轮询不算人在体验；只有真实输入延长运行资源的空闲期限。
        let activity="<script>(()=>{let last=0;for(const e of ['pointerdown','wheel','keydown'])document.addEventListener(e,()=>{if(Date.now()-last<30000)return;last=Date.now();fetch('/__activity',{method:'POST',credentials:'same-origin',keepalive:true}).catch(()=>{});},{passive:true,capture:true});})();</script>";
        html.replace("</body>",&format!("{activity}</body>")).into_bytes()
    }else{data.to_vec()};
    let mut response=(status,Body::from(data)).into_response();
    for (k,v) in &headers {if !matches!(k.as_str(),"set-cookie"|"connection"|"transfer-encoding"|"content-length"|"location") {response.headers_mut().insert(k.clone(),v.clone());}}
    if let Some(location)=headers.get(header::LOCATION) {
        if location.to_str().is_ok_and(|v|v.starts_with('/')&&!v.starts_with("//")) {response.headers_mut().insert(header::LOCATION,location.clone());}
    }
    response.headers_mut().insert(header::CACHE_CONTROL,HeaderValue::from_static("no-store"));
    Ok(response)
}
pub async fn serve(store:Store)->anyhow::Result<()> {
    let id:Uuid=std::env::var("XENICA_RUNTIME_ID")?.parse()?;
    let host=format!("history-{id}.xenica.truebigsand.top");
    let upstream=std::env::var("XENICA_RUNTIME_UPSTREAM")?;
    anyhow::ensure!(upstream==format!("http://xenica-history-{id}-app:8080"),"invalid upstream");
    let cookie=std::fs::read_to_string("/run/secrets/runtime_session")?.trim().to_owned();
    anyhow::ensure!(cookie.len()==64 && cookie.bytes().all(|b|b.is_ascii_hexdigit()),"invalid runtime session");
    let p=Proxy{store,id,host,upstream,cookie,client:reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(30)).build()?};
    let router=Router::new().route("/__bridge",get(bridge)).fallback(proxy).with_state(p);
    let listener=tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    axum::serve(listener,router).await?;Ok(())
}
