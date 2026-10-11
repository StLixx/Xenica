use std::io::{Read, Write};

use anyhow::Context;
use tracing_subscriber::EnvFilter;
use xenica_server::{AppState, config::Config};
use xenica_store::Store;

const USAGE: &str = "usage: xenica [serve | openapi | healthcheck]";

fn runtime_actor()->xenica_core::Actor {xenica_core::Actor::Processor{id:"historical-runtime".into(),version:"0.2.5".into()}}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    match std::env::args().nth(1).as_deref() {
        None | Some("serve") => serve().await,
        Some("openapi") => {
            println!("{}", xenica_server::openapi().to_pretty_json()?);
            Ok(())
        }
        Some("healthcheck") => healthcheck("/api/health"),
        Some("runtime-healthcheck") => healthcheck("/__health"),
        Some("runtime-proxy") => xenica_server::runtime_proxy::serve(Store::connect(&std::env::var("DATABASE_URL")?).await?).await,
        Some("runtime-queue") => {
            let store=Store::connect(&std::env::var("DATABASE_URL")?).await?;
            store.expire_runtimes(&runtime_actor()).await?;
            println!("{}",serde_json::to_string(&store.development_runtimes().await?)?); Ok(())
        }
        Some("runtime-state") => {
            let args:Vec<String>=std::env::args().collect();
            anyhow::ensure!(args.len()==6,"runtime-state ID GENERATION STATE MESSAGE");
            let store=Store::connect(&std::env::var("DATABASE_URL")?).await?;
            store.runtime_state(&runtime_actor(),args[2].parse()?,args[3].parse()?,&args[4],&args[5]).await?; Ok(())
        }
        Some("runtime-session") => {
            let store=Store::connect(&std::env::var("DATABASE_URL")?).await?;
            let user=match store.find_user_by_name("xenica_history_bridge").await? {
                Some((u,_))=>u,
                None=>store.create_user(None,"xenica_history_bridge",&xenica_server::auth::hash_password(&xenica_server::auth::runtime_token())).await?,
            };
            let token=xenica_server::auth::runtime_token();
            use sha2::Digest;
            store.create_session(user.id,&sha2::Sha256::digest(token.as_bytes()),chrono::Utc::now()+chrono::Duration::hours(24)).await?;
            println!("{token}");Ok(())
        }
        Some("archive-export") => {
            let id = std::env::args().nth(2).context("缺少草图 ID")?.parse()?;
            let store = Store::connect(&std::env::var("DATABASE_URL")?).await?;
            println!(
                "{}",
                serde_json::to_string(
                    &xenica_server::archive::export(&store, xenica_core::NodeId(id)).await?
                )?
            );
            Ok(())
        }
        Some("archive-import") => {
            let store = Store::connect(&std::env::var("DATABASE_URL")?).await?;
            let archive = serde_json::from_reader(std::io::stdin().take(128 * 1024 * 1024))?;
            let node = xenica_server::archive::import(&store, archive).await?;
            println!("{}", node.id);
            Ok(())
        }
        Some("board-attach") => {
            let source=std::env::args().nth(2).context("缺少原件节点 ID")?.parse()?;
            let store=Store::connect(&std::env::var("DATABASE_URL")?).await?;
            let board=xenica_server::archive::attach_to_board(&store,xenica_core::NodeId(source)).await?;
            println!("{}",board.id);Ok(())
        }
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
fn healthcheck(path:&str) -> anyhow::Result<()> {
    let addr = std::env::var("XENICA_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let port = addr.rsplit(':').next().unwrap_or("8080");
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port.parse::<u16>()?))?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(3)))?;
    stream.write_all(format!("GET {path} HTTP/1.0\r\nHost: localhost\r\n\r\n").as_bytes())?;
    let mut buf = String::new();
    stream.read_to_string(&mut buf)?;
    if buf.starts_with("HTTP/1.0 200") || buf.starts_with("HTTP/1.1 200") {
        Ok(())
    } else {
        anyhow::bail!("unhealthy: {}", buf.lines().next().unwrap_or(""))
    }
}
