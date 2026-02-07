use surrealdb::engine::local::RocksDb;
use surrealdb::Surreal;

use crate::config::AppConfig;

/// SurrealDB 嵌入式连接类型
pub type Db = Surreal<surrealdb::engine::local::Db>;

/// 初始化 SurrealDB 嵌入式连接
pub async fn init_db(config: &AppConfig) -> Result<Db, surrealdb::Error> {
    tracing::info!("正在连接 SurrealDB（嵌入式）: {}", config.db_path);

    let db = Surreal::new::<RocksDb>(&config.db_path).await?;

    // 设置命名空间和数据库
    db.use_ns("xenica").use_db("xenica").await?;

    tracing::info!("SurrealDB 连接成功");
    Ok(db)
}
