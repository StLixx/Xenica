# Xenica / 织念

个人思维伙伴 — 异质信息的智能连接体。

不是笔记工具，不是知识管理，是**大脑的外延**。基于图数据库存储认知瞬间，通过 AI 自动建立关联，让你的想法自然生长。

## 技术栈

- **后端**：Rust + Axum
- **数据库**：SurrealDB（嵌入式，RocksDB 存储引擎）
- **前端**：React + TypeScript + TailwindCSS + react-flow（开发中）
- **LLM**：Antigravity API（本地代理）

## 构建

```bash
cd backend
cargo build --release
```

## 运行

```bash
cd backend
./target/release/xenica
```

一个文件启动全部：Axum HTTP 服务 + SurrealDB 嵌入式数据库。

默认端口：`3001`

## API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/conversations` | 创建对话 |
| GET | `/api/conversations` | 列出对话 |
| POST | `/api/moments` | 创建认知瞬间 |
| GET | `/api/moments` | 列出（分页，可按 conversation_id 筛选） |
| GET | `/api/moments/{id}` | 获取单个 |
| GET | `/api/moments/{id}/related` | 获取关联节点（一度关联） |
| POST | `/api/entities` | 创建实体 |
| GET | `/api/entities` | 列出实体 |
| GET | `/api/search?q=...` | 文本搜索（moments + entities） |
| POST | `/api/relations` | 创建关联边 |
| POST | `/api/goals` | 创建目标 |
| GET | `/api/goals` | 列出目标 |

所有响应 JSON 格式，时间使用 ISO 8601。

## 配置

环境变量或 `config.rs` 中修改：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `XENICA_PORT` | `3001` | HTTP 服务端口 |
| `XENICA_LLM_ENDPOINT` | `http://127.0.0.1:8045/v1/chat/completions` | LLM API 地址 |
| `XENICA_LLM_MODEL` | `gemini-3-flash` | 默认模型 |
| `XENICA_DB_PATH` | `data` | SurrealDB 数据目录 |

## 数据

SurrealDB 数据存储在 `backend/data/` 目录（已 gitignore）。
