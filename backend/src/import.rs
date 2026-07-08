use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use uuid::Uuid;

use crate::db;
use crate::models::NewEdgeForImport;
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportInput {
    pub file_path: PathBuf,
    pub mime_type: String,
    pub user_notes: Option<String>,
    pub batch_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewNode {
    pub content: String,
    pub connections: Vec<(usize, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportOutput {
    pub nodes: Vec<NewNode>,
    pub edges: Vec<NewEdgeForImport>,
}

#[derive(Debug, Clone)]
pub struct ImportContext {
    pub pool: PgPool,
    pub upload_dir: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub enum ImportError {
    #[error("unsupported MIME type: {0}")]
    UnsupportedMimeType(String),
    #[error("handler error: {0}")]
    Handler(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("other: {0}")]
    Other(#[from] anyhow::Error),
}

pub trait ImportHandler: Send + Sync {
    fn supported_mime_types(&self) -> Vec<String>;
    fn process(&self, input: ImportInput, ctx: &ImportContext) -> Result<ImportOutput, ImportError>;
}

#[derive(Default)]
pub struct HandlerRegistry {
    handlers: HashMap<String, Arc<dyn ImportHandler>>,
}

impl HandlerRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register<H: ImportHandler + 'static>(&mut self, handler: H) {
        let handler = Arc::new(handler);
        for mime in handler.supported_mime_types() {
            self.handlers.insert(mime, handler.clone());
        }
    }

    pub fn get(&self, mime_type: &str) -> Option<Arc<dyn ImportHandler>> {
        self.handlers.get(mime_type).cloned()
    }

    pub fn supported(&self) -> Vec<String> {
        let mut v: Vec<String> = self.handlers.keys().cloned().collect();
        v.sort();
        v
    }
}

pub fn default_registry() -> HandlerRegistry {
    let mut reg = HandlerRegistry::new();
    reg.register(PureTextHandler);
    reg.register(ImageHandler);
    reg
}

pub struct PureTextHandler;

impl ImportHandler for PureTextHandler {
    fn supported_mime_types(&self) -> Vec<String> {
        vec![
            "text/plain".into(),
            "text/markdown".into(),
            "text/x-markdown".into(),
            "application/x-markdown".into(),
        ]
    }

    fn process(&self, input: ImportInput, _ctx: &ImportContext) -> Result<ImportOutput, ImportError> {
        let content = std::fs::read_to_string(&input.file_path)
            .map_err(ImportError::Io)?;

        let mut content = content;
        if let Some(notes) = input.user_notes.as_ref() {
            if !notes.is_empty() {
                content.push_str(&format!("\n\n---\n[User Notes]\n{}", notes));
            }
        }

        Ok(ImportOutput {
            nodes: vec![NewNode {
                content,
                connections: vec![],
            }],
            edges: vec![],
        })
    }
}

pub struct ImageHandler;

impl ImportHandler for ImageHandler {
    fn supported_mime_types(&self) -> Vec<String> {
        vec![
            "image/png".into(),
            "image/jpeg".into(),
            "image/jpg".into(),
            "image/webp".into(),
            "image/gif".into(),
        ]
    }

    fn process(&self, input: ImportInput, ctx: &ImportContext) -> Result<ImportOutput, ImportError> {
        let file_name = input
            .file_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| ImportError::Handler("invalid file name".into()))?;

        let ext = input
            .file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");

        let stored_name = format!("{}-{}.{}", Uuid::new_v4(), sanitize(file_name), ext);
        let dest = ctx.upload_dir.join(&stored_name);

        std::fs::create_dir_all(&ctx.upload_dir).map_err(ImportError::Io)?;
        std::fs::copy(&input.file_path, &dest).map_err(ImportError::Io)?;

        let stored_path_str = dest.to_string_lossy().to_string();

        let mut content = format!("[Image]: {}", stored_path_str);
        if let Some(notes) = input.user_notes.as_ref() {
            if !notes.is_empty() {
                content.push_str(&format!("\n\n{}", notes));
            }
        }

        Ok(ImportOutput {
            nodes: vec![NewNode {
                content,
                connections: vec![],
            }],
            edges: vec![],
        })
    }
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect()
}

pub struct ExternalCliHandler {
    pub binary_path: PathBuf,
    pub mime_types: Vec<String>,
}

impl ImportHandler for ExternalCliHandler {
    fn supported_mime_types(&self) -> Vec<String> {
        self.mime_types.clone()
    }

    fn process(&self, input: ImportInput, _ctx: &ImportContext) -> Result<ImportOutput, ImportError> {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let payload = serde_json::to_string(&serde_json::json!({
            "file_path": input.file_path.to_string_lossy(),
            "mime_type": input.mime_type,
            "user_notes": input.user_notes,
            "batch_id": input.batch_id,
        }))
        .map_err(|e| ImportError::Handler(e.to_string()))?;

        let mut child = Command::new(&self.binary_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| ImportError::Handler(format!("spawn failed: {}", e)))?;

        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(payload.as_bytes()).map_err(ImportError::Io)?;
        }

        let output = child.wait_with_output().map_err(ImportError::Io)?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(ImportError::Handler(format!("CLI failed: {}", stderr)));
        }

        let result: ImportOutput = serde_json::from_slice(&output.stdout)
            .map_err(|e| ImportError::Handler(format!("invalid CLI output: {}", e)))?;

        Ok(result)
    }
}

pub async fn write_import_output(
    pool: &PgPool,
    out: ImportOutput,
) -> Result<Vec<Uuid>> {
    if out.nodes.is_empty() {
        return Ok(vec![]);
    }

    let mut node_ids = Vec::with_capacity(out.nodes.len());
    for new_node in &out.nodes {
        let id = db::insert_node_raw(pool, &new_node.content).await?;
        node_ids.push(id);
    }

    for edge in &out.edges {
        let source = node_ids
            .get(edge.source_index)
            .ok_or_else(|| anyhow!("edge source_index out of bounds"))?;
        let target = node_ids
            .get(edge.target_index)
            .ok_or_else(|| anyhow!("edge target_index out of bounds"))?;
        db::insert_edge_raw(pool, *source, *target, &edge.label).await?;
    }

    for (i, new_node) in out.nodes.iter().enumerate() {
        let source = node_ids[i];
        for (target_idx, label) in &new_node.connections {
            let target = node_ids
                .get(*target_idx)
                .ok_or_else(|| anyhow!("connection target_index out of bounds"))?;
            db::insert_edge_raw(pool, source, *target, label).await?;
        }
        db::enqueue_embedding_task(pool, source)
            .await
            .context("enqueue embedding task")?;
    }

    Ok(node_ids)
}
