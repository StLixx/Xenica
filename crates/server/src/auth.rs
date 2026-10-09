//! 鉴权（docs/adr/0007-auth.md）：用户名 + 密码登录，会话令牌放在 HttpOnly Cookie 里。
//! `/api` 下除了 `is_public()` 列出的路径全部要登录——新接口默认受保护，不用记得加。

use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use axum::{
    extract::{FromRequestParts, Request, State},
    http::{HeaderMap, HeaderValue, Method, header, request::Parts},
    middleware::Next,
    response::{IntoResponse, Response},
};
use sha2::{Digest, Sha256};
use xenica_core::{Actor, User};

use crate::{ApiError, AppState};

pub const COOKIE: &str = "xenica_session";
pub const SESSION_DAYS: i64 = 30;
const MAX_FAILURES: u32 = 5;
const LOCK_FOR: Duration = Duration::from_secs(15 * 60);
/// 设置码的失败计数用这个键，和用户名分开。
pub(crate) const SETUP_KEY: &str = "#setup";

/// 进程内的鉴权状态：一次性设置码、输错计数。重启后清空（设置码会重新生成）。
pub struct Auth {
    setup_code: Mutex<Option<String>>,
    failures: Mutex<HashMap<String, Failures>>,
    /// 示例数据模式（预览站）：登录页提示示例账号。
    pub demo: bool,
}

struct Failures {
    count: u32,
    since: Instant,
    locked_until: Option<Instant>,
}

impl Auth {
    pub fn new(setup_code: Option<String>, demo: bool) -> Self {
        Self {
            setup_code: Mutex::new(setup_code),
            failures: Mutex::default(),
            demo,
        }
    }

    pub fn setup_code(&self) -> Option<String> {
        self.setup_code.lock().unwrap().clone()
    }

    /// 设置码对了就把它用掉（只能用一次）。
    pub(crate) fn take_setup_code(&self, code: &str) -> bool {
        let mut slot = self.setup_code.lock().unwrap();
        let normalized = code.trim().to_uppercase();
        match slot.as_deref() {
            Some(c) if same(c.as_bytes(), normalized.as_bytes()) => {
                *slot = None;
                true
            }
            _ => false,
        }
    }

    pub(crate) fn restore_setup_code(&self, code: String) {
        *self.setup_code.lock().unwrap() = Some(code);
    }

    pub(crate) fn check_locked(&self, key: &str) -> Result<(), ApiError> {
        let failures = self.failures.lock().unwrap();
        match failures
            .get(&key.to_lowercase())
            .and_then(|f| f.locked_until)
        {
            Some(until) if until > Instant::now() => {
                let minutes = (until - Instant::now()).as_secs().div_ceil(60);
                Err(ApiError::locked(format!(
                    "输错次数太多，{minutes} 分钟后再试"
                )))
            }
            _ => Ok(()),
        }
    }

    pub(crate) fn record_failure(&self, key: &str) {
        let now = Instant::now();
        let mut failures = self.failures.lock().unwrap();
        let f = failures.entry(key.to_lowercase()).or_insert(Failures {
            count: 0,
            since: now,
            locked_until: None,
        });
        if now - f.since > LOCK_FOR || f.locked_until.is_some_and(|u| u <= now) {
            *f = Failures {
                count: 0,
                since: now,
                locked_until: None,
            };
        }
        f.count += 1;
        if f.count >= MAX_FAILURES {
            f.locked_until = Some(now + LOCK_FOR);
        }
    }

    pub(crate) fn clear_failures(&self, key: &str) {
        self.failures.lock().unwrap().remove(&key.to_lowercase());
    }
}

/// 常数时间比较，避免按响应时间猜设置码。
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut buf = [0u8; N];
    getrandom::fill(&mut buf).expect("system random source");
    buf
}

/// 一次性设置码，形如 `K7QM-2XPF`（去掉了容易看错的 0/O、1/I/L）。
pub fn new_setup_code() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let raw = random_bytes::<8>();
    let chars: String = raw
        .iter()
        .map(|b| ALPHABET[*b as usize % ALPHABET.len()] as char)
        .collect();
    format!("{}-{}", &chars[..4], &chars[4..])
}

/// Argon2id（库的默认参数）。
pub fn hash_password(password: &str) -> String {
    let salt = SaltString::encode_b64(&random_bytes::<16>()).expect("salt");
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("argon2 hash")
        .to_string()
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash).is_ok_and(|h| {
        Argon2::default()
            .verify_password(password.as_bytes(), &h)
            .is_ok()
    })
}

/// 用户名不存在时也算一次哈希，让「没有这个人」和「密码不对」花的时间一样。
pub(crate) static DUMMY_HASH: LazyLock<String> =
    LazyLock::new(|| hash_password("xenica-dummy-password"));

/// 新会话令牌（32 字节随机数，十六进制）。库里只存它的 SHA-256。
pub(crate) fn new_token() -> String {
    random_bytes::<32>()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

pub(crate) fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// 分享链接的令牌（16 字节随机数，十六进制）。
/// 和会话令牌不同：它存明文——要能在界面上重新显示出来。
pub(crate) fn new_share_token() -> String {
    random_bytes::<16>()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

pub(crate) fn session_cookie(token: &str) -> HeaderValue {
    let max_age = SESSION_DAYS * 24 * 3600;
    HeaderValue::from_str(&format!(
        "{COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={max_age}"
    ))
    .expect("cookie header")
}

pub(crate) fn clear_cookie() -> HeaderValue {
    HeaderValue::from_str(&format!(
        "{COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    ))
    .expect("cookie header")
}

pub(crate) fn token_from(headers: &HeaderMap) -> Option<&str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|kv| kv.trim().strip_prefix(COOKIE)?.strip_prefix('='))
        .filter(|t| !t.is_empty())
}

/// 当前登录的账号。handler 参数里写 `user: CurrentUser` 即可。
#[derive(Debug, Clone)]
pub struct CurrentUser(pub User);

impl CurrentUser {
    pub fn actor(&self) -> Actor {
        Actor::user(self.0.id)
    }
}

impl<S: Send + Sync> FromRequestParts<S> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, ApiError> {
        parts
            .extensions
            .get::<CurrentUser>()
            .cloned()
            .ok_or_else(ApiError::unauthorized)
    }
}

fn is_public(path: &str) -> bool {
    path == "/api/health"
        || path.starts_with("/api/auth/")
        // 分享链接：知道链接就能读、能改（凭据在路径里）。见 docs/adr/0009-sketch.md。
        || path.starts_with("/api/share/")
}

/// 跨站请求防护：会改数据的请求，如果带了 Origin，就必须和 Host 一致。
/// （SameSite=Lax 已经挡住了别的网站；这一条再挡住同一个根域名下的其他子域名，比如 PR 预览站。）
fn cross_origin(req: &Request) -> bool {
    if matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS) {
        return false;
    }
    let Some(origin) = req.headers().get(header::ORIGIN) else {
        return false;
    };
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok());
    let origin_host = origin
        .to_str()
        .ok()
        .and_then(|o| o.split_once("://"))
        .map(|(_, rest)| rest);
    origin_host.is_none() || origin_host != host
}

/// 挂在整个 `/api` 上的中间件。
pub async fn guard(State(state): State<AppState>, mut req: Request, next: Next) -> Response {
    if cross_origin(&req) {
        return ApiError::forbidden("跨站请求被拒绝").into_response();
    }
    if is_public(req.uri().path()) {
        return next.run(req).await;
    }
    let Some(token) = token_from(req.headers()) else {
        return ApiError::unauthorized().into_response();
    };
    match state.store.session_user(&token_hash(token)).await {
        Ok(Some(user)) => {
            req.extensions_mut().insert(CurrentUser(user));
            next.run(req).await
        }
        Ok(None) => ApiError::unauthorized().into_response(),
        Err(e) => ApiError::from(e).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_round_trip() {
        let h = hash_password("correct horse");
        assert!(h.starts_with("$argon2id$"));
        assert!(verify_password("correct horse", &h));
        assert!(!verify_password("wrong horse", &h));
        assert!(!verify_password("x", "not a hash"));
    }

    #[test]
    fn setup_code_is_single_use() {
        let auth = Auth::new(Some("ABCD-EFGH".into()), false);
        assert!(!auth.take_setup_code("ABCD-EFGX"));
        assert!(auth.take_setup_code(" abcd-efgh "));
        assert!(!auth.take_setup_code("ABCD-EFGH"));
        assert_eq!(new_setup_code().len(), 9);
    }

    #[test]
    fn locks_after_five_failures() {
        let auth = Auth::new(None, false);
        for _ in 0..4 {
            auth.record_failure("Lixx");
        }
        assert!(auth.check_locked("lixx").is_ok());
        auth.record_failure("lixx");
        assert!(auth.check_locked("LIXX").is_err());
        auth.clear_failures("lixx");
        assert!(auth.check_locked("lixx").is_ok());
    }

    #[test]
    fn reads_session_cookie() {
        let mut h = HeaderMap::new();
        h.insert(
            header::COOKIE,
            "a=1; xenica_session=abc; b=2".parse().unwrap(),
        );
        assert_eq!(token_from(&h), Some("abc"));
        h.insert(header::COOKIE, "xenica_sessionx=abc".parse().unwrap());
        assert_eq!(token_from(&h), None);
    }
}
