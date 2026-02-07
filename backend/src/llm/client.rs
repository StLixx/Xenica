use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::config::AppConfig;

/// LLM 客户端
#[derive(Clone)]
pub struct LlmClient {
    client: Client,
    endpoint: String,
    model: String,
}

/// 聊天消息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 请求体
#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
}

/// 响应体
#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: String,
}

impl LlmClient {
    /// 创建新的 LLM 客户端
    pub fn new(config: &AppConfig) -> Self {
        Self {
            client: Client::new(),
            endpoint: config.llm_endpoint.clone(),
            model: config.llm_model.clone(),
        }
    }

    /// 发送聊天请求，返回 AI 回复文本
    pub async fn chat(
        &self,
        system_prompt: &str,
        messages: Vec<ChatMessage>,
    ) -> Result<String, reqwest::Error> {
        let mut all_messages = vec![ChatMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        }];
        all_messages.extend(messages);

        let request = ChatRequest {
            model: self.model.clone(),
            messages: all_messages,
        };

        let response = self
            .client
            .post(&self.endpoint)
            .json(&request)
            .send()
            .await?
            .json::<ChatResponse>()
            .await?;

        Ok(response
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default())
    }
}
