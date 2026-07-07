## L1 / core-capabilities

> 这是 Xenica 项目的**第四个 L1 thread**，承载 Phase 2 核心能力建设。上一个 thread（architecture-foundation）完成了场景驱动的 Phase 1 最小架构（nodes + edges 两张表、5 个 API 端点、Rust + Axum + sqlx + PG 17），现在在此基础上补齐搜索、异步任务、外部内容导入和格式化插件接口。

## 目标

在 Phase 1 架构基础上，补齐搜索能力、异步任务基础设施、外部内容导入管道和格式化插件接口，覆盖 S8/S2/S5 的底座以及图片/语音批量导入的实际使用场景。

## 范围

### 全文搜索

- 安装 zhparser 扩展，配置中文分词
- 给 nodes.content 建 GIN 索引
- 支持自定义词典（专有名词不分词）

### 语义搜索

- 给 nodes 加 embedding 列（vector 类型，pgvector 扩展）
- 选 embedding 模型（本地优先如 BGE-small-zh，云端 API 可替换）
- 创建/更新节点时自动生成向量（异步 worker 触发，不阻塞 API 响应）

### 混合排序

- RRF（Reciprocal Ranked Fusion）融合全文和语义结果
- 支持权重偏好配置（全文优先 / 语义优先 / 均等）

### Worker 四队列

- Scheduled → Main → Retry（指数退避）→ Dead Letter
- 基于 PG LISTEN/NOTIFY
- visibility timeout 保证 at-least-once 交付

### 格式转换插件接口

- 注册制，每个格式一个独立模块
- 支持本地模型和第三方 API 的可替换配置
- 运行时按需加载

### 导入管道

- PDF：MinerU / 本地 OCR 可选，章节自动拆成节点并连边
- 视频讲义：PPT 截图 + 字幕文本各成节点
- 图片批量导入：可附带语音/文本标注，可暂不连边延迟组织

### API 扩展

- `GET /nodes/search?q=...&mode=hybrid|fulltext|semantic`

## 不在范围

- MCP / Agent 集成 → S3 底座，独立 L2 thread
- 前端可视化（聚类渲染、Blog 发布、化学式/3D 预览器）→ 前端侧
- 代码解析与 git 集成 → S4，Phase 3
- 第三方 API 的付费策略 → 只留可替换接口，运行时配置

## 终止条件

1. 搜索端点可用，三种模式（全文/语义/混合）返回 RRF 排序结果
2. zhparser 中文分词正确，"所有权"命中"Rust 的所有权机制"
3. 语义搜索能找到内容相似但关键词不同的节点
4. Worker 四队列跑通——至少一个异步管道从入队到完成全链路
5. PDF 导入管道跑通——一本书的章节自动拆成节点并连边
6. 视频讲义导入管道跑通——PPT 截图 + 字幕文本各成节点
7. 图片批量导入跑通——多张图片一次请求，可附带标注，可暂不连边
8. 插件接口定义完成，至少两个格式转换器注册成功
9. embedding 自动生成——创建节点时异步生成向量，不阻塞 API 响应
10. 当前数据模型不变——nodes + edges 两张表，所有新功能不加新表结构（向量列除外）
