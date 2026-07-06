mod db;
mod handlers;
mod models;

use anyhow::Result;
use clap::{Parser, Subcommand};
use handlers::AppState;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use uuid::Uuid;

#[derive(Parser)]
#[command(name = "xenica", about = "Xenica 个人知识图谱系统")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    Serve,
    Create {
        content: String,
        #[arg(short, long = "connect", value_parser = parse_connection)]
        connections: Vec<(Uuid, String)>,
    },
    Show {
        id: Uuid,
    },
    Neighbors {
        id: Uuid,
    },
    List,
}

fn parse_connection(s: &str) -> Result<(Uuid, String), String> {
    let parts: Vec<&str> = s.splitn(2, ',').collect();
    if parts.len() != 2 {
        return Err("format: UUID,label".into());
    }
    let id = Uuid::parse_str(parts[0]).map_err(|e| e.to_string())?;
    Ok((id, parts[1].to_string()))
}

async fn run_server(pool: sqlx::PgPool, port: u16) -> Result<()> {
    use axum::{Router, routing::get};
    use tower_http::cors::{CorsLayer, Any};

    let state = AppState { pool };

    let app = Router::new()
        .route("/nodes", get(handlers::list_nodes).post(handlers::create_node))
        .route("/nodes/{id}", get(handlers::get_node))
        .route("/nodes/{id}/neighbors", get(handlers::get_neighbors))
        .route("/edges", get(handlers::list_edges))
        .layer(CorsLayer::new().allow_origin(Any))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    println!("API Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn api_url() -> String {
    let port = std::env::var("API_PORT").unwrap_or_else(|_| "3000".into());
    format!("http://127.0.0.1:{}", port)
}

async fn cli_create(content: String, connections: Vec<(Uuid, String)>) -> Result<()> {
    let body = serde_json::json!({
        "content": content,
        "connections": connections.iter().map(|(id, label)| {
            serde_json::json!({ "target_id": id, "label": label })
        }).collect::<Vec<_>>()
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/nodes", api_url().await))
        .json(&body)
        .send()
        .await?;

    let json: serde_json::Value = resp.json().await?;
    println!("{}", serde_json::to_string_pretty(&json)?);
    Ok(())
}

async fn cli_show(id: Uuid) -> Result<()> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/nodes/{}", api_url().await, id))
        .send()
        .await?;

    let json: serde_json::Value = resp.json().await?;
    println!("{}", serde_json::to_string_pretty(&json)?);
    Ok(())
}

async fn cli_neighbors(id: Uuid) -> Result<()> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/nodes/{}/neighbors", api_url().await, id))
        .send()
        .await?;

    let json: serde_json::Value = resp.json().await?;
    println!("{}", serde_json::to_string_pretty(&json)?);
    Ok(())
}

async fn cli_list() -> Result<()> {
    let client = reqwest::Client::new();
    let nodes_resp = client
        .get(format!("{}/nodes", api_url().await))
        .send()
        .await?;
    let edges_resp = client
        .get(format!("{}/edges", api_url().await))
        .send()
        .await?;

    let nodes_json: serde_json::Value = nodes_resp.json().await?;
    let edges_json: serde_json::Value = edges_resp.json().await?;

    println!("=== Nodes ===");
    println!("{}", serde_json::to_string_pretty(&nodes_json)?);
    println!("=== Edges ===");
    println!("{}", serde_json::to_string_pretty(&edges_json)?);
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/xenica".into());
    let port: u16 = std::env::var("API_PORT")
        .unwrap_or_else(|_| "3000".into())
        .parse()
        .unwrap_or(3000);

    let cli = Cli::parse();

    match cli.command {
        None | Some(Command::Serve) => {
            let pool = PgPoolOptions::new()
                .max_connections(5)
                .connect(&database_url)
                .await?;

            db::run_migrations(&pool).await?;
            println!("Database migrations applied.");

            run_server(pool, port).await?;
        }
        Some(Command::Create { content, connections }) => {
            cli_create(content, connections).await?;
        }
        Some(Command::Show { id }) => {
            cli_show(id).await?;
        }
        Some(Command::Neighbors { id }) => {
            cli_neighbors(id).await?;
        }
        Some(Command::List) => {
            cli_list().await?;
        }
    }

    Ok(())
}
