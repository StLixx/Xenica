use anyhow::{Context, Result, bail};
use reqwest::{
    Client,
    header::{AUTHORIZATION, HeaderMap, HeaderValue},
};
use serde_json::{Value, json};
use std::{path::Path, time::Duration};
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;
#[derive(Clone)]
pub struct Provider {
    pub base: String,
    pub version: String,
    client: Client,
    headers: HeaderMap,
    configured: bool,
}
impl Provider {
    pub fn new() -> Result<Self> {
        let base = std::env::var("MINERU_PROVIDER_BASE")
            .unwrap_or_else(|_| "https://mineru.org.cn/api/v4".into());
        if !base.starts_with("https://") {
            bail!("provider requires https");
        }
        let version = std::env::var("MINERU_DESKTOP_VERSION").unwrap_or_else(|_| "0.14.1".into());
        let bearer = std::env::var("MINERU_API_BEARER").unwrap_or_default();
        let token = std::env::var("MINERU_DESKTOP_TOKEN").unwrap_or_default();
        let configured = !bearer.is_empty() && !token.is_empty();
        let mut headers = HeaderMap::new();
        if configured {
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {bearer}"))?,
            );
            headers.insert("token", HeaderValue::from_str(&token)?);
            headers.insert("version", HeaderValue::from_str(&version)?);
        }
        let client = Client::builder()
            .timeout(Duration::from_secs(35))
            .connect_timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::limited(3))
            .user_agent("MinerU/0.14.1")
            .build()?;
        Ok(Self {
            base: base.trim_end_matches('/').into(),
            version,
            client,
            headers,
            configured,
        })
    }
    pub fn configured(&self) -> bool {
        self.configured
    }
    async fn json(&self, request: reqwest::RequestBuilder) -> Result<Value> {
        if !self.configured {
            bail!("provider credentials unavailable");
        }
        let response = request
            .headers(self.headers.clone())
            .send()
            .await
            .context("provider network")?;
        let status = response.status();
        if !status.is_success() {
            bail!("provider HTTP {}", status.as_u16());
        }
        let bytes = response.bytes().await.context("provider response")?;
        if bytes.len() > 4 * 1024 * 1024 {
            bail!("provider response too large");
        }
        let result: Value = serde_json::from_slice(&bytes).context("provider JSON")?;
        if result
            .get("code")
            .is_some_and(|c| !matches!(c.as_i64(), Some(0) | Some(200)))
        {
            bail!(
                "provider API code {}",
                result["code"].as_i64().unwrap_or(-1)
            );
        }
        Ok(result)
    }
    pub async fn create(&self, id: &str, name: &str, settings: &Value) -> Result<Value> {
        let body = json!({"files":[{"name":name,"data_id":id,"page_ranges":""}],
            "is_ocr":settings["ocr"].as_bool().unwrap_or(false),"enable_formula":settings["formula"].as_bool().unwrap_or(true),
            "enable_table":settings["table"].as_bool().unwrap_or(true),"language":settings["language"].as_str().unwrap_or("ch"),
            "model_version":settings["model"].as_str().unwrap_or("vlm"),"is_chem":false});
        self.json(
            self.client
                .post(format!("{}/file-urls/batch", self.base))
                .json(&body),
        )
        .await
    }
    pub async fn upload(&self, created: &Value, path: &Path) -> Result<()> {
        let data = created.get("data").context("missing provider data")?;
        let url = data["file_urls"][0]
            .as_str()
            .context("missing upload URL")?;
        validate_download_url(url)?;
        let content_type = data["headers"][0]["Content-Type"]
            .as_str()
            .unwrap_or("application/pdf");
        let file = tokio::fs::File::open(path).await?;
        let size = file.metadata().await?.len();
        let response = self
            .client
            .put(url)
            .timeout(Duration::from_secs(300))
            .header("Content-Type", content_type)
            .header("Content-Length", size)
            .body(reqwest::Body::wrap_stream(ReaderStream::new(file)))
            .send()
            .await
            .context("provider upload")?;
        if !response.status().is_success() {
            bail!("provider upload HTTP {}", response.status().as_u16());
        }
        Ok(())
    }
    pub async fn poll(&self, batch: &str) -> Result<Value> {
        if batch.len() > 160
            || !batch
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            bail!("invalid provider batch");
        }
        self.json(
            self.client
                .get(format!("{}/extract-results/batch/{batch}", self.base)),
        )
        .await
    }
    pub async fn download(&self, url: &str, dest: &Path) -> Result<()> {
        validate_download_url(url)?;
        let mut response = self
            .client
            .get(url)
            .timeout(Duration::from_secs(300))
            .send()
            .await
            .context("provider download")?;
        if !response.status().is_success() {
            bail!("download HTTP {}", response.status().as_u16());
        }
        if response
            .content_length()
            .is_some_and(|v| v > 512 * 1024 * 1024)
        {
            bail!("bundle download too large");
        }
        let partial = dest.with_extension("partial");
        let mut file = tokio::fs::File::create(&partial).await?;
        let mut size = 0_u64;
        while let Some(chunk) = response.chunk().await.context("bundle chunk")? {
            size += chunk.len() as u64;
            if size > 512 * 1024 * 1024 {
                bail!("bundle download limit");
            }
            file.write_all(&chunk).await?;
        }
        file.sync_all().await?;
        drop(file);
        tokio::fs::rename(partial, dest).await?;
        Ok(())
    }
}
fn validate_download_url(value: &str) -> Result<()> {
    let url = reqwest::Url::parse(value)?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        bail!("unsafe provider URL");
    }
    if let Some(host) = url.host_str() {
        if host == "localhost" || host.parse::<std::net::IpAddr>().is_ok() || !host.contains('.') {
            bail!("unsafe provider host");
        }
    } else {
        bail!("provider URL missing host");
    }
    Ok(())
}
