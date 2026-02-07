use crate::db::connection::Db;

/// 初始化数据库 Schema
pub async fn init_schema(db: &Db) -> Result<(), surrealdb::Error> {
    tracing::info!("正在初始化数据库 Schema...");

    // 对话
    db.query(
        "
        DEFINE TABLE IF NOT EXISTS conversation SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS title ON conversation TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS created_at ON conversation TYPE datetime;
        DEFINE FIELD IF NOT EXISTS model ON conversation TYPE option<string>;
        ",
    )
    .await?;

    // 认知瞬间（核心节点）
    db.query(
        "
        DEFINE TABLE IF NOT EXISTS moment SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS raw_input ON moment TYPE string;
        DEFINE FIELD IF NOT EXISTS refined ON moment TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS trigger ON moment TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS timestamp ON moment TYPE datetime;
        DEFINE FIELD IF NOT EXISTS location ON moment TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS perspectives ON moment TYPE array<string>;
        DEFINE FIELD IF NOT EXISTS embedding ON moment TYPE option<array<float>>;
        DEFINE FIELD IF NOT EXISTS conversation_id ON moment TYPE option<record<conversation>>;
        DEFINE FIELD IF NOT EXISTS extracted ON moment TYPE bool DEFAULT false;
        DEFINE FIELD IF NOT EXISTS weight ON moment TYPE float DEFAULT 0;
        ",
    )
    .await?;

    // 实体（可复用知识点）
    db.query(
        "
        DEFINE TABLE IF NOT EXISTS entity SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS name ON entity TYPE string;
        DEFINE FIELD IF NOT EXISTS entity_type ON entity TYPE string;
        DEFINE FIELD IF NOT EXISTS description ON entity TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS embedding ON entity TYPE option<array<float>>;
        DEFINE FIELD IF NOT EXISTS weight ON entity TYPE float DEFAULT 0;
        ",
    )
    .await?;

    // 关联边
    db.query(
        "
        DEFINE TABLE IF NOT EXISTS relates_to SCHEMAFULL TYPE RELATION FROM moment|entity TO moment|entity;
        DEFINE FIELD IF NOT EXISTS relation_type ON relates_to TYPE string;
        DEFINE FIELD IF NOT EXISTS description ON relates_to TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS strength ON relates_to TYPE option<float>;
        DEFINE FIELD IF NOT EXISTS created_at ON relates_to TYPE option<datetime>;
        ",
    )
    .await?;

    // 消息（对话历史）
    db.query(
        "
        DEFINE TABLE IF NOT EXISTS message SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS conversation_id ON message TYPE record<conversation>;
        DEFINE FIELD IF NOT EXISTS role ON message TYPE string;
        DEFINE FIELD IF NOT EXISTS content ON message TYPE string;
        DEFINE FIELD IF NOT EXISTS timestamp ON message TYPE datetime;
        DEFINE FIELD IF NOT EXISTS moment_id ON message TYPE option<record<moment>>;
        ",
    )
    .await?;

    // 演化边
    db.query(
        "
        DEFINE TABLE IF NOT EXISTS evolves_from SCHEMAFULL TYPE RELATION FROM moment TO moment;
        DEFINE FIELD IF NOT EXISTS description ON evolves_from TYPE option<string>;
        ",
    )
    .await?;

    // 目标
    db.query(
        "
        DEFINE TABLE IF NOT EXISTS goal SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS title ON goal TYPE string;
        DEFINE FIELD IF NOT EXISTS description ON goal TYPE option<string>;
        DEFINE FIELD IF NOT EXISTS priority ON goal TYPE option<int>;
        DEFINE FIELD IF NOT EXISTS created_at ON goal TYPE datetime;
        ",
    )
    .await?;

    tracing::info!("数据库 Schema 初始化完成");
    Ok(())
}
