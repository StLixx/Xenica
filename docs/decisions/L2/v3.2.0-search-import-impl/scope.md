## L2 / search-import-impl

> 这是 Xenica 项目在 core-capabilities 下的**第二个 L2 thread**。在 infrastructure-setup 完成环境配置后，实现搜索功能、embedding 生成、Worker 四队列和导入管道的代码。

## 来源

L1 core-capabilities thread + L2 infrastructure-setup thread。

## 目标

实现 Phase 2 全部搜索与导入能力的 Rust 代码——搜索端点、embedding 自动生成、Worker 任务队列、导入管道 handler 注册。不涉及 L3 级别的具体 handler 实现细节（如 MinerU CLI 的内部队列逻辑），只定义接口和核心框架。

## 输入（继承自 L1 core-capabilities）

- **search-index ADR**：独立表 `search_index` 表结构、nodes 加 embedding 列、BGE-M3 + EmbeddingProvider trait
- **import-pipeline ADR**：ImportHandler trait + ImportInput/ImportOutput + HandlerRegistry + MinerU 独立子项目方案
- **Worker 四队列**：scope.md 中定义的四队列架构（Scheduled → Main → Retry → Dead Letter）

## 范围

### 1. embedding 自动生成

- 实现 `EmbeddingProvider trait` 的硅基流动适配器（`SiliconFlowEmbedder`）
- 创建/更新节点时，异步生成向量并写入 nodes.embedding
- Worker 触发 embedding 生成，不阻塞 API 响应

### 2. 搜索端点

- `GET /nodes/search?q=...&mode=...&language=zh|en`
- 全文模式：search_index 查 tsvector
- 语义模式：nodes.embedding 向量相似排序
- 混合模式：RRF 融合全文和语义结果

### 3. Worker 四队列

- 建 task 表（id/type/payload/status/attempts/next_execution_at/created_at）
- Scheduled → Main → Retry → Dead Letter 状态机
- 基于 PG LISTEN/NOTIFY 的事件驱动调度
- visibility timeout 保证 at-least-once 交付

### 4. 导入管道框架

- 实现 `ImportHandler trait` + `HandlerRegistry`
- 实现 `ExternalCliHandler` 适配器（stdin/stdout 跨进程通信）
- 实现纯文本 handler（读文件内容 → create node）
- 实现图片 handler（存储文件 → 创建节点引用文件路径）

### 5. API 扩展

- `POST /import`：接收文件 + MIME type → 路由 handler → 入 Main Queue

## 不在范围

- MinerU CLI 子应用的实现 → 独立子项目，独立 L2 thread
- ffmpeg 视频处理 handler → 独立子项目，独立 L2 thread
- 前端搜索界面 → 前端侧
- embedding 模型训练/微调 → 不需要

## 终止条件

1. `POST /nodes` 创建节点后，embedding 列自动被 worker 异步填充
2. `GET /nodes/search?q=所有权&mode=fulltext&language=zh` 返回包含"所有权"的节点
3. `GET /nodes/search?q=borrow&mode=fulltext&language=en` 返回纯英文节点
4. `GET /nodes/search?q=所有权&mode=semantic` 返回语义相关节点（不一定含关键词）
5. `GET /nodes/search?q=所有权&mode=hybrid` 返回 RRF 融合排序结果
6. Worker 四队列状态机跑通——pending → running → done/failed → retry → dead_lettered
7. POST /import（纯文本文件）→ 创建节点
8. POST /import（图片文件）→ 图片存储 + 创建引用节点
