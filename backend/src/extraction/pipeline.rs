use serde::{Deserialize, Serialize};

use crate::api::routes::{Entity, Moment, RelateEdge};
use crate::db::connection::Db;
use crate::llm::client::{ChatMessage, LlmClient};

// ─── LLM 返回的提取结果 ───

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub refined: Option<String>,
    pub entities: Vec<ExtractedEntity>,
    pub perspectives: Vec<String>,
    pub relations: Vec<ExtractedRelation>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedEntity {
    pub name: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedRelation {
    pub to_entity: String,
    pub relation_type: String,
    pub description: Option<String>,
}

// ─── 提取 Prompt ───

const EXTRACTION_PROMPT: &str = "\
你是 Xenica 的知识提取引擎。分析以下文本，提取结构化信息。

已有实体（如果文本提到了这些，请使用完全相同的名称而不是创建新的）：
{existing_entities}

用户原文：
{raw_input}

请输出纯 JSON（不要 markdown 代码块），格式：
{
  \"refined\": \"用更精确的语言重新表述核心内容（如果是观点类的话）\",
  \"entities\": [
    {\"name\": \"实体名\", \"type\": \"person|concept|work|place|event|term\", \"description\": \"一句话描述\"}
  ],
  \"perspectives\": [\"视角标签1\", \"视角标签2\"],
  \"relations\": [
    {\"to_entity\": \"已有实体名或新实体名\", \"relation_type\": \"semantic|temporal|sensory\", \"description\": \"关联描述\"}
  ]
}

注意：
- 只输出纯 JSON，不要其他文字
- entities 中如果和已有实体匹配，使用完全相同的名称
- perspectives 是中文标签，如：认知科学、作文素材、体育史、待办任务
- 如果原文不是观点类（比如只是记录事实），refined 可以为 null";

/// 构建提取 Prompt
fn build_prompt(raw_input: &str, existing_entities: &[Entity]) -> String {
    let entities_str = if existing_entities.is_empty() {
        "（暂无已有实体）".to_string()
    } else {
        existing_entities
            .iter()
            .map(|e| format!("- {} ({})", e.name, e.entity_type))
            .collect::<Vec<_>>()
            .join("\n")
    };

    EXTRACTION_PROMPT
        .replace("{existing_entities}", &entities_str)
        .replace("{raw_input}", raw_input)
}

/// 解析 LLM 返回的 JSON，容忍 markdown 代码块包裹
fn parse_extraction_json(raw: &str) -> Result<ExtractionResult, String> {
    // 去掉可能的 markdown 代码块
    let cleaned = raw.trim();
    let cleaned = if cleaned.starts_with("```") {
        // 去掉 ```json 或 ```
        let start = cleaned.find('\n').map(|i| i + 1).unwrap_or(0);
        let end = cleaned.rfind("```").unwrap_or(cleaned.len());
        &cleaned[start..end]
    } else {
        cleaned
    };

    serde_json::from_str::<ExtractionResult>(cleaned.trim())
        .map_err(|e| format!("JSON 解析失败: {} | 原文: {}", e, &cleaned[..cleaned.len().min(200)]))
}

// ─── 核心提取流程 ───

/// 对单个 moment 执行提取，返回提取结果摘要
pub async fn extract_moment(
    db: &Db,
    llm: &LlmClient,
    moment_id: &str,
) -> Result<ExtractionResult, String> {
    let thing = format!("moment:{}", moment_id);

    // 1. 读取 moment
    let moment: Moment = {
        let result: Result<Vec<Moment>, _> = db
            .query("SELECT * FROM <record>$id")
            .bind(("id", thing.clone()))
            .await
            .and_then(|mut r| r.take(0));

        match result {
            Ok(mut records) => records
                .pop()
                .ok_or_else(|| format!("moment {} 不存在", moment_id))?,
            Err(e) => return Err(format!("查询 moment 失败: {}", e)),
        }
    };

    // 2. 获取已有实体列表（取最近 50 个）
    let existing_entities: Vec<Entity> = {
        let result: Result<Vec<Entity>, _> = db
            .query("SELECT * FROM entity ORDER BY name ASC LIMIT 50")
            .await
            .and_then(|mut r| r.take(0));
        result.unwrap_or_default()
    };

    // 3. 构建 prompt 并调用 LLM
    let prompt = build_prompt(&moment.raw_input, &existing_entities);

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let system = "你是一个精确的 JSON 生成器。只输出合法 JSON，不要任何其他文字。";

    let llm_response = llm
        .chat(system, messages.clone(), None)
        .await
        .map_err(|e| format!("LLM 调用失败: {}", e))?;

    // 4. 解析 JSON（失败则重试一次）
    let extraction = match parse_extraction_json(&llm_response) {
        Ok(result) => result,
        Err(first_err) => {
            tracing::warn!("首次解析失败: {}，正在重试...", first_err);

            let retry_response = llm
                .chat(system, messages, None)
                .await
                .map_err(|e| format!("LLM 重试调用失败: {}", e))?;

            parse_extraction_json(&retry_response)
                .map_err(|e| format!("重试仍失败: {}", e))?
        }
    };

    // 5. 更新 moment 的 refined 和 perspectives
    let refined = extraction.refined.clone();
    let perspectives = extraction.perspectives.clone();

    let update_result: Result<Vec<serde_json::Value>, _> = db
        .query(
            "UPDATE type::thing('moment', $mid) SET refined = $refined, perspectives = $perspectives, extracted = true",
        )
        .bind(("mid", moment_id.to_string()))
        .bind(("refined", refined))
        .bind(("perspectives", perspectives))
        .await
        .and_then(|mut r| r.take(0));
    if let Err(e) = &update_result {
        tracing::error!("更新 moment {} extracted 状态失败: {}", moment_id, e);
    }

    // 6. 创建或关联实体
    for entity in &extraction.entities {
        // 查找是否已存在同名实体
        let existing: Vec<Entity> = db
            .query("SELECT * FROM entity WHERE name = $name LIMIT 1")
            .bind(("name", entity.name.clone()))
            .await
            .and_then(|mut r| r.take(0))
            .unwrap_or_default();

        let entity_thing = if let Some(existing_entity) = existing.into_iter().next() {
            // 已存在，使用现有 ID
            existing_entity
                .id
                .map(|t| format!("entity:{}", t.id.to_raw()))
                .unwrap_or_default()
        } else {
            // 不存在，创建新实体
            let created: Result<Vec<Entity>, _> = db
                .query(
                    "CREATE entity SET name = $name, entity_type = $entity_type, description = $description",
                )
                .bind(("name", entity.name.clone()))
                .bind(("entity_type", entity.entity_type.clone()))
                .bind(("description", entity.description.clone()))
                .await
                .and_then(|mut r| r.take(0));

            match created {
                Ok(mut records) => match records.pop() {
                    Some(e) => e
                        .id
                        .map(|t| format!("entity:{}", t.id.to_raw()))
                        .unwrap_or_default(),
                    None => continue,
                },
                Err(e) => {
                    tracing::error!("创建实体 {} 失败: {}", entity.name, e);
                    continue;
                }
            }
        };

        // 7. 创建 moment -> entity 关联边
        if !entity_thing.is_empty() {
            let relate_result: Result<Vec<RelateEdge>, _> = db
                .query(
                    "LET $f = <record>$from; LET $t = <record>$to; RELATE $f->relates_to->$t SET relation_type = 'semantic', description = 'extracted entity'",
                )
                .bind(("from", thing.clone()))
                .bind(("to", entity_thing))
                .await
                .and_then(|mut r| r.take(2));
            if let Err(e) = relate_result {
                tracing::error!("创建 moment->entity 关联边失败: {}", e);
            }
        }
    }

    // 8. 创建 relations
    for relation in &extraction.relations {
        // 找到目标实体
        let target: Vec<Entity> = db
            .query("SELECT * FROM entity WHERE name = $name LIMIT 1")
            .bind(("name", relation.to_entity.clone()))
            .await
            .and_then(|mut r| r.take(0))
            .unwrap_or_default();

        if let Some(target_entity) = target.into_iter().next() {
            let target_thing = target_entity
                .id
                .map(|t| format!("entity:{}", t.id.to_raw()))
                .unwrap_or_default();

            if !target_thing.is_empty() {
                let relate_result: Result<Vec<RelateEdge>, _> = db
                    .query(
                        "LET $f = <record>$from; LET $t = <record>$to; RELATE $f->relates_to->$t SET relation_type = $rel_type, description = $desc",
                    )
                    .bind(("from", thing.clone()))
                    .bind(("to", target_thing))
                    .bind(("rel_type", relation.relation_type.clone()))
                    .bind(("desc", relation.description.clone()))
                    .await
                    .and_then(|mut r| r.take(2));
                if let Err(e) = relate_result {
                    tracing::error!("创建 moment->entity 关联失败: {}", e);
                }
            }
        }
    }

    tracing::info!(
        "moment {} 提取完成: {} 个实体, {} 个视角, {} 个关联",
        moment_id,
        extraction.entities.len(),
        extraction.perspectives.len(),
        extraction.relations.len(),
    );

    Ok(extraction)
}

/// 对整个对话执行提取（批量提取未提取的 moment）
pub async fn extract_conversation(
    db: &Db,
    llm: &LlmClient,
    conversation_id: &str,
) -> Result<Vec<String>, String> {
    let conv_thing = format!("conversation:{}", conversation_id);

    // 查找该对话下所有未提取的 moment
    let moments: Vec<Moment> = db
        .query(
            "SELECT * FROM moment WHERE conversation_id = <record>$conv_id AND extracted = false ORDER BY timestamp ASC",
        )
        .bind(("conv_id", conv_thing))
        .await
        .and_then(|mut r| r.take(0))
        .map_err(|e| format!("查询对话 moment 失败: {}", e))?;

    if moments.is_empty() {
        return Ok(vec!["没有待提取的 moment".to_string()]);
    }

    let mut results = Vec::new();

    for moment in &moments {
        let moment_id = moment
            .id
            .as_ref()
            .map(|t| t.id.to_raw())
            .unwrap_or_default();

        match extract_moment(db, llm, &moment_id).await {
            Ok(extraction) => {
                results.push(format!(
                    "moment {} 提取成功: {} 实体, {} 视角",
                    moment_id,
                    extraction.entities.len(),
                    extraction.perspectives.len(),
                ));
            }
            Err(e) => {
                tracing::error!("moment {} 提取失败: {}", moment_id, e);
                results.push(format!("moment {} 提取失败: {}", moment_id, e));
            }
        }
    }

    Ok(results)
}
