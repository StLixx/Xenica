use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::config::AppConfig;

/// OCR 使用的视觉模型
const VISION_MODEL: &str = "gpt-4.1";

/// OCR system prompt
const OCR_SYSTEM_PROMPT: &str = "请识别图片中的所有文字，直接输出文字内容，不要加任何解释";

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

    /// 返回默认模型名
    pub fn default_model(&self) -> &str {
        &self.model
    }

    /// 发送聊天请求，返回 AI 回复文本
    /// model_override: 可选，覆盖默认模型
    pub async fn chat(
        &self,
        system_prompt: &str,
        messages: Vec<ChatMessage>,
        model_override: Option<&str>,
    ) -> Result<String, String> {
        let model = model_override
            .unwrap_or(&self.model)
            .to_string();

        let mut all_messages = vec![ChatMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        }];
        all_messages.extend(messages);

        let request = ChatRequest {
            model,
            messages: all_messages,
        };

        let response = self
            .client
            .post(&self.endpoint)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("请求发送失败: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("LLM 返回 {}: {}", status, body));
        }

        let chat_resp: ChatResponse = response
            .json()
            .await
            .map_err(|e| format!("响应解析失败: {}", e))?;

        Ok(chat_resp
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default())
    }

    /// 视觉 OCR：发送图片给 Gemini Flash 视觉模型，返回识别出的文字
    ///
    /// image_base64: 图片的 base64 编码
    /// mime_type: 图片 MIME 类型（如 "image/jpeg"）
    pub async fn vision_ocr(
        &self,
        image_base64: &str,
        mime_type: &str,
    ) -> Result<String, String> {
        let data_url = format!("data:{};base64,{}", mime_type, image_base64);

        let request_body = serde_json::json!({
            "model": VISION_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": OCR_SYSTEM_PROMPT
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data_url
                            }
                        }
                    ]
                }
            ]
        });

        let response = self
            .client
            .post(&self.endpoint)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("请求发送失败: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "无法读取响应体".to_string());
            return Err(format!("LLM 返回 {}: {}", status, body));
        }

        let chat_resp: ChatResponse = response
            .json()
            .await
            .map_err(|e| format!("响应解析失败: {}", e))?;

        Ok(chat_resp
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default())
    }
}
