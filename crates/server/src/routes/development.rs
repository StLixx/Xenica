use axum::{Json, extract::{Path, State}};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use crate::{ApiError, AppState, auth::{CurrentUser,new_token,token_hash}};

#[derive(Clone, Deserialize, Serialize, ToSchema)]
pub struct Version {
    pub id:String,
    pub title:String,
    pub changes:Vec<String>,
    pub source:String,
    pub image:String,
    pub snapshot:String,
    pub snapshot_sha256:String,
    pub available:bool,
    pub reason:String,
}
#[derive(Deserialize)]
struct Catalog { schema:u32, versions:Vec<Version> }
pub fn catalog() -> Result<Vec<Version>,ApiError> {
    let path=std::env::var("XENICA_VERSION_CATALOG").unwrap_or_else(|_|"/run/xenica-versions/catalog.json".into());
    let data=match std::fs::read(path) {
        Ok(data)=>data,
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(vec![]),
        Err(_)=>return Err(ApiError::internal()),
    };
    let catalog:Catalog=serde_json::from_slice(&data).map_err(|_|ApiError::internal())?;
    if catalog.schema!=1 {return Err(ApiError::internal())}
    let mut ids=std::collections::HashSet::new();
    for v in &catalog.versions {if !valid_version(v) || !ids.insert(&v.id) {return Err(ApiError::internal())}}
    Ok(catalog.versions)
}
pub fn valid_version(v:&Version)->bool {
    let hex=|s:&str,n:usize|s.len()==n && s.bytes().all(|b|b.is_ascii_hexdigit() && !b.is_ascii_uppercase());
    !v.id.is_empty() && v.id.len()<48 && v.id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'.'||b==b'-') &&
    (!v.available || (hex(&v.source,40) && v.image.strip_prefix("ghcr.io/stlixx/xenica@sha256:").is_some_and(|s|hex(s,64)) &&
    v.snapshot==format!("{}.sql",v.id) && hex(&v.snapshot_sha256,64)))
}
fn find(id:&str)->Result<Version,ApiError> {catalog()?.into_iter().find(|v|v.id==id).ok_or_else(ApiError::not_found)}

#[derive(Serialize,ToSchema)]
pub struct Runtime {
    pub id:Uuid,
    pub version:String,
    pub generation:i64,
    pub state:String,
    pub message:String,
}
impl From<xenica_store::DevelopmentRuntime> for Runtime {
    fn from(r:xenica_store::DevelopmentRuntime)->Self {Self{id:r.id,version:r.version,generation:r.generation,state:r.state,message:r.message}}
}
#[derive(Serialize,ToSchema)]
pub struct Bridge { pub url:String }
#[utoipa::path(get,path="/api/development/versions",responses((status=200,body=Vec<Version>)))]
pub async fn versions(_user:CurrentUser)->Result<Json<Vec<Version>>,ApiError> {Ok(Json(catalog()?))}
#[utoipa::path(get,path="/api/development/versions/{id}",params(("id"=String,Path)),responses((status=200,body=Version)))]
pub async fn version(_user:CurrentUser,Path(id):Path<String>)->Result<Json<Version>,ApiError> {Ok(Json(find(&id)?))}
#[utoipa::path(post,path="/api/development/versions/{id}/start",params(("id"=String,Path)),responses((status=200,body=Runtime)))]
pub async fn start(State(state):State<AppState>,user:CurrentUser,Path(id):Path<String>)->Result<Json<Runtime>,ApiError> {
    let v=find(&id)?;
    if !v.available {return Err(ApiError::new(axum::http::StatusCode::CONFLICT,"unavailable",v.reason))}
    Ok(Json(state.store.start_runtime(&user.actor(),&v.id,&v.image,&v.snapshot_sha256).await?.into()))
}
#[utoipa::path(get,path="/api/development/runtimes/{id}",params(("id"=Uuid,Path)),responses((status=200,body=Runtime)))]
pub async fn status(State(state):State<AppState>,_user:CurrentUser,Path(id):Path<Uuid>)->Result<Json<Runtime>,ApiError> {
    Ok(Json(state.store.development_runtimes().await?.into_iter().find(|r|r.id==id).ok_or_else(ApiError::not_found)?.into()))
}
#[utoipa::path(post,path="/api/development/runtimes/{id}/bridge",params(("id"=Uuid,Path)),responses((status=200,body=Bridge)))]
pub async fn bridge(State(state):State<AppState>,user:CurrentUser,Path(id):Path<Uuid>)->Result<Json<Bridge>,ApiError> {
    let token=new_token();
    state.store.runtime_ticket(&user.actor(),user.0.id,id,&token_hash(&token)).await?;
    Ok(Json(Bridge{url:format!("https://history-{id}.xenica.truebigsand.top/__bridge?ticket={token}")}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_rejects_mutable_images_and_unsafe_snapshots() {
        let mut v=Version{id:"v0.2.1".into(),title:"v0.2.1".into(),changes:vec![],source:"a".repeat(40),image:format!("ghcr.io/stlixx/xenica@sha256:{}","b".repeat(64)),snapshot:"v0.2.1.sql".into(),snapshot_sha256:"c".repeat(64),available:true,reason:String::new()};
        assert!(valid_version(&v)); v.image="ghcr.io/stlixx/xenica:latest".into();assert!(!valid_version(&v));
        v.available=false;assert!(valid_version(&v));v.id="../v0.2.1".into();assert!(!valid_version(&v));
    }
}
