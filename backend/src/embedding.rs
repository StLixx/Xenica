use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct SiliconFlowEmbedder {
    api_key: String,
    model: String,
    client: reqwest::Client,
}

impl SiliconFlowEmbedder {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            api_key,
            model,
            client: reqwest::Client::new(),
        }
    }

    pub async fn embed(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        let req = EmbeddingRequest {
            model: self.model.clone(),
            input: texts,
        };

        let resp = self
            .client
            .post("https://api.siliconflow.cn/v1/embeddings")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&req)
            .send()
            .await?;

        let body: EmbeddingResponse = resp.json().await?;
        Ok(body.data.into_iter().map(|d| d.embedding).collect())
    }
}

#[derive(Serialize)]
struct EmbeddingRequest {
    model: String,
    input: Vec<String>,
}

#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}
