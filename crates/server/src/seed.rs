//! 示例数据：预览环境和本地试用时导入（`XENICA_SEED=demo`）。
//! 数据在 `fixtures/demo.json`，用 key 互相引用；导入时换成真正的 ID，痕迹记为处理器 `seed`。

use std::collections::HashMap;

use anyhow::{Context, bail};
use serde::Deserialize;
use xenica_core::{Actor, NewEdge, NewNode};
use xenica_store::Store;

pub const DEMO: &str = include_str!("../fixtures/demo.json");

#[derive(Deserialize)]
struct Fixture {
    nodes: Vec<FixtureNode>,
    edges: Vec<FixtureEdge>,
}

#[derive(Deserialize)]
struct FixtureNode {
    key: String,
    kind: String,
    title: String,
    #[serde(default)]
    body: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct FixtureEdge {
    source: String,
    target: String,
    kind: String,
}

/// 按名字取示例数据。
pub fn fixture(name: &str) -> anyhow::Result<&'static str> {
    match name {
        "demo" => Ok(DEMO),
        other => bail!("unknown seed {other:?} (available: demo)"),
    }
}

/// 示例账号 `demo` / `demo`（只在示例数据模式下创建；预览站登录用）。库里已有账号就不建，返回 false。
pub async fn ensure_demo_user(store: &Store) -> anyhow::Result<bool> {
    if store.count_users().await? > 0 {
        return Ok(false);
    }
    let actor = Actor::Processor {
        id: "seed".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    };
    let hash = crate::auth::hash_password("demo");
    store.create_user(Some(&actor), "demo", &hash).await?;
    Ok(true)
}

/// 库里还没有节点时导入，返回导入的节点数；已有数据就什么都不做，返回 0。
pub async fn seed_if_empty(store: &Store, json: &str) -> anyhow::Result<usize> {
    if !store.list_nodes(1).await?.is_empty() {
        return Ok(0);
    }
    let fixture: Fixture = serde_json::from_str(json).context("invalid seed json")?;
    let actor = Actor::Processor {
        id: "seed".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    };
    let mut ids = HashMap::new();
    for n in &fixture.nodes {
        let node = store
            .create_node(
                &actor,
                NewNode {
                    kind: Some(n.kind.clone()),
                    title: n.title.clone(),
                    body: n.body.clone(),
                },
            )
            .await
            .with_context(|| format!("seed node {}", n.key))?;
        if ids.insert(n.key.as_str(), node.id).is_some() {
            bail!("duplicate seed key {}", n.key);
        }
    }
    for e in &fixture.edges {
        let id = |key: &str| {
            ids.get(key)
                .copied()
                .with_context(|| format!("seed edge refers to unknown key {key}"))
        };
        store
            .create_edge(
                &actor,
                NewEdge {
                    source: id(&e.source)?,
                    target: id(&e.target)?,
                    kind: Some(e.kind.clone()),
                },
            )
            .await
            .with_context(|| format!("seed edge {} -> {}", e.source, e.target))?;
    }
    Ok(fixture.nodes.len())
}
