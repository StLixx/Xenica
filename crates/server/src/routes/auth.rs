//! 登录、首次设置、退出。这些路径不要求已登录（见 `auth::is_public`）。

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{AppendHeaders, IntoResponse, Response},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use xenica_core::{User, check_password, normalize_user_name};

use crate::{
    ApiError, AppState,
    auth::{
        DUMMY_HASH, SESSION_DAYS, SETUP_KEY, clear_cookie, hash_password, new_token,
        session_cookie, token_from, token_hash, verify_password,
    },
    error::ErrorBody,
};

#[derive(Serialize, ToSchema)]
pub struct Session {
    /// 当前登录的账号；没登录为空。
    pub user: Option<User>,
    /// 还没有任何账号：界面显示「创建账号」，需要服务日志里的设置码。
    pub setup_required: bool,
    /// 示例数据模式（预览站）：可以用 `demo` / `demo` 登录。
    pub demo: bool,
}

#[derive(Deserialize, ToSchema)]
pub struct Login {
    pub name: String,
    pub password: String,
}

#[derive(Deserialize, ToSchema)]
pub struct Setup {
    /// 服务启动时打印在日志里的一次性设置码。
    pub code: String,
    pub name: String,
    pub password: String,
}

/// 当前会话（是否登录、是否需要首次设置）。
#[utoipa::path(get, path = "/api/auth/session", tag = "auth",
    responses((status = 200, body = Session)))]
pub async fn session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Session>, ApiError> {
    let user = match token_from(&headers) {
        Some(t) => state.store.session_user(&token_hash(t)).await?,
        None => None,
    };
    let setup_required = user.is_none() && state.store.count_users().await? == 0;
    Ok(Json(Session {
        user,
        setup_required,
        demo: state.auth.demo,
    }))
}

async fn start_session(
    state: &AppState,
    user: User,
    status: StatusCode,
) -> Result<Response, ApiError> {
    let token = new_token();
    let expires = Utc::now() + chrono::Duration::days(SESSION_DAYS);
    state
        .store
        .create_session(user.id, &token_hash(&token), expires)
        .await?;
    Ok((
        status,
        AppendHeaders([(header::SET_COOKIE, session_cookie(&token))]),
        Json(user),
    )
        .into_response())
}

/// 登录。同一用户名连续输错 5 次锁 15 分钟。
#[utoipa::path(post, path = "/api/auth/login", tag = "auth", request_body = Login,
    responses((status = 200, body = User), (status = 401, body = ErrorBody), (status = 429, body = ErrorBody)))]
pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<Login>,
) -> Result<Response, ApiError> {
    let name = input.name.trim().to_owned();
    state.auth.check_locked(&name)?;
    let found = state.store.find_user_by_name(&name).await?;
    let hash = found
        .as_ref()
        .map(|(_, h)| h.clone())
        .unwrap_or_else(|| DUMMY_HASH.clone());
    let password = input.password;
    let ok = tokio::task::spawn_blocking(move || verify_password(&password, &hash))
        .await
        .unwrap_or(false);
    match found {
        Some((user, _)) if ok => {
            state.auth.clear_failures(&name);
            start_session(&state, user, StatusCode::OK).await
        }
        _ => {
            state.auth.record_failure(&name);
            Err(ApiError::new(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "用户名或密码不对",
            ))
        }
    }
}

/// 首次设置：库里还没有账号时，用设置码创建第一个账号并登录。
#[utoipa::path(post, path = "/api/auth/setup", tag = "auth", request_body = Setup,
    responses((status = 201, body = User), (status = 400, body = ErrorBody),
        (status = 403, body = ErrorBody), (status = 409, body = ErrorBody), (status = 429, body = ErrorBody)))]
pub async fn setup(
    State(state): State<AppState>,
    Json(input): Json<Setup>,
) -> Result<Response, ApiError> {
    if state.store.count_users().await? > 0 {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "conflict",
            "已经设置过了，请直接登录",
        ));
    }
    state.auth.check_locked(SETUP_KEY)?;
    let name = normalize_user_name(&input.name).map_err(ApiError::from_domain)?;
    check_password(&input.password).map_err(ApiError::from_domain)?;
    let code = input.code.trim().to_uppercase();
    if !state.auth.take_setup_code(&code) {
        state.auth.record_failure(SETUP_KEY);
        return Err(ApiError::forbidden(
            "设置码不对（在服务日志里找「设置码」）",
        ));
    }
    let password = input.password;
    let hash = tokio::task::spawn_blocking(move || hash_password(&password))
        .await
        .map_err(|_| ApiError::internal())?;
    match state.store.create_user(None, &name, &hash).await {
        Ok(user) => start_session(&state, user, StatusCode::CREATED).await,
        Err(e) => {
            state.auth.restore_setup_code(code);
            Err(e.into())
        }
    }
}

/// 退出登录。没登录也返回 204。
#[utoipa::path(post, path = "/api/auth/logout", tag = "auth", responses((status = 204)))]
pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    if let Some(t) = token_from(&headers) {
        state.store.delete_session(&token_hash(t)).await?;
    }
    Ok((
        StatusCode::NO_CONTENT,
        AppendHeaders([(header::SET_COOKIE, clear_cookie())]),
    ))
}
