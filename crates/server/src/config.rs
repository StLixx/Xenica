use std::{net::SocketAddr, path::PathBuf};

use anyhow::Context;

/// 全部配置来自环境变量（见 `deploy/.env.example`）。
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub addr: SocketAddr,
    pub web_dist: Option<PathBuf>,
}

pub const DEFAULT_ADDR: &str = "0.0.0.0:8080";

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL is not set")?;
        let addr = std::env::var("XENICA_ADDR")
            .unwrap_or_else(|_| DEFAULT_ADDR.to_owned())
            .parse()
            .context("XENICA_ADDR must look like 0.0.0.0:8080")?;
        let web_dist = std::env::var_os("XENICA_WEB_DIST")
            .map(PathBuf::from)
            .or_else(|| Some(PathBuf::from("web/dist")))
            .filter(|p| p.join("index.html").is_file());
        Ok(Self {
            database_url,
            addr,
            web_dist,
        })
    }
}
