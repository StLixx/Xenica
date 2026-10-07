use std::io::{Read, Write};

use anyhow::Context;
use tracing_subscriber::EnvFilter;
use xenica_server::{AppState, config::Config};
use xenica_store::Store;

const USAGE: &str = "usage: xenica [serve | openapi | healthcheck]";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    match std::env::args().nth(1).as_deref() {
        None | Some("serve") => serve().await,
        Some("openapi") => {
            println!("{}", xenica_server::openapi().to_pretty_json()?);
            Ok(())
        }
        Some("healthcheck") => healthcheck(),
        Some(_) => {
            eprintln!("{USAGE}");
            std::process::exit(2)
        }
    }
}

async fn serve() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();
    let config = Config::from_env()?;
    let store = Store::connect(&config.database_url)
        .await
        .context("cannot connect to database")?;
    store.migrate().await.context("migration failed")?;
    if let Some(name) = &config.seed {
        let n =
            xenica_server::seed::seed_if_empty(&store, xenica_server::seed::fixture(name)?).await?;
        tracing::info!(seed = %name, nodes = n, "seed checked");
        if name == "demo" && xenica_server::seed::ensure_demo_user(&store).await? {
            tracing::info!("created demo user (demo / demo)");
        }
    }
    let demo = config.seed.as_deref() == Some("demo");
    let state = AppState::new(store, demo).await?;
    if let Some(code) = state.auth.setup_code() {
        tracing::warn!(
            "还没有账号。打开网页，用设置码 {code} 创建第一个账号（只能用一次，重启后换新）"
        );
    }
    if config.web_dist.is_none() {
        tracing::warn!("web assets not found; serving API only");
    }
    let app = xenica_server::app(state, config.web_dist.as_deref());
    let listener = tokio::net::TcpListener::bind(config.addr).await?;
    tracing::info!(addr = %config.addr, "xenica listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler");
        tokio::select! { _ = ctrl_c => {}, _ = term.recv() => {} }
    }
    #[cfg(not(unix))]
    let _ = ctrl_c.await;
}

/// 给容器健康检查用：不依赖 curl，直接请求 `/api/health`。
fn healthcheck() -> anyhow::Result<()> {
    let addr = std::env::var("XENICA_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let port = addr.rsplit(':').next().unwrap_or("8080");
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port.parse::<u16>()?))?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(3)))?;
    stream.write_all(b"GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n")?;
    let mut buf = String::new();
    stream.read_to_string(&mut buf)?;
    if buf.starts_with("HTTP/1.0 200") || buf.starts_with("HTTP/1.1 200") {
        Ok(())
    } else {
        anyhow::bail!("unhealthy: {}", buf.lines().next().unwrap_or(""))
    }
}
