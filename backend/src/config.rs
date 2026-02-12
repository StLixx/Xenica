/// 应用配置
#[derive(Debug, Clone)]
pub struct AppConfig {
    /// HTTP 服务端口
    pub port: u16,
    /// LLM API 端点
    pub llm_endpoint: String,
    /// 默认模型名
    pub llm_model: String,
    /// SurrealDB 数据目录
    pub db_path: String,
}

impl AppConfig {
    /// 从环境变量加载配置，未设置则使用默认值
    pub fn from_env() -> Self {
        Self {
            port: std::env::var("XENICA_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3002),
            llm_endpoint: std::env::var("XENICA_LLM_ENDPOINT")
                .unwrap_or_else(|_| "http://127.0.0.1:8092/v1/chat/completions".to_string()),
            llm_model: std::env::var("XENICA_LLM_MODEL")
                .unwrap_or_else(|_| "gpt-4.1".to_string()),
            db_path: std::env::var("XENICA_DB_PATH")
                .unwrap_or_else(|_| "data".to_string()),
        }
    }
}
