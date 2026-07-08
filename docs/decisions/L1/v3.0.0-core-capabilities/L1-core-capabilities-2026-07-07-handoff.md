## L1 / core-capabilities / Session Handoff

**日期**: 2026-07-07
**来源 scope**: [scope.md](scope.md)

---

## Current State

core-capabilities thread 完成了 Phase 2 的架构设计和大部分代码实现。这是 architecture-foundation 之后第一个 L1 thread，在两张表的基础上补齐了搜索、Worker 异步基础设施和导入管道架构。

### L1 层产出

| 类别 | 内容 | 状态 |
|------|------|------|
| scope | 10 条终止条件覆盖 S8/S2/S5 底座 | done |
| ADR: search-index | 独立表 search_index + pgvector HNSW + BGE-M3 1024 维 + zhparser 中文分词 | accepted |
| ADR: import-pipeline | ImportHandler trait + ImportInput/ImportOutput + HandlerRegistry + 可实现性调研 | accepted |
| principles | 决策不重复不断裂（25 条） | done |

### L2 infrastructure-setup

- Docker PG 17 + pgvector 0.8.4 + zhparser 2.3
- nodes.embedding vector(1024) + HNSW 索引
- search_index 表 + GIN 索引
- zh_cn + english 两套分词已就绪
- BGE-M3 硅基流动 API 密钥已配置，连通性已验证

[handoff 文档](infrastructure-setup/L2-infrastructure-setup-2026-07-07.md)

### L2 search-import-impl（代码层面）

搜索功能全部完成并通过端到端测试：

| 功能 | 命令 | 结果 |
|------|------|------|
| 中文全文 | `search "所有权" -m fulltext -l zh` | ✅ |
| 英文全文 | `search "borrow checker" -m fulltext -l en` | ✅ |
| 语义搜索 | `search "borrow checking" -m semantic` | ✅ 跨语言匹配 0.33 |
| 混合搜索 | `search "memory safety" -m hybrid -l en` | ✅ RRF 融合排序 |
| Worker 四队列 | pending→running→done/retry→dead_lettered | ✅ 指数退避 |
| embedding 异步生成 | 创建节点 → 2 秒自动填充 | ✅ |
| 全文索引同步 | 创建节点时同步写 search_index（中英双行） | ✅ |

scope 中未完成的两条：

| # | 条件 | 状态 | 原因 |
|------|------|------|------|
| 7 | POST /import（纯文本文件）→ 创建节点 | ❌ | 需要下一个 session 实现 HandlerRegistry + ExternalCliHandler |
| 8 | POST /import（图片文件）→ 图片存储 + 创建引用节点 | ❌ | 同上 |

---

## Decisions Made

### 技术选型

- **embedding 模型**：BAAI/bge-m3（1024 维），硅基流动免费 API
- **pgvector 索引**：HNSW（不需要预训练，空表可建）
- **中文分词**：zhparser，映射 n/v/a/i/e/l 六类词性
- **搜索索引**：独立表 search_index，多语言通过新增行扩展（不改 nodes 表）
- **Worker**：tasks 表 + 后台轮询（2 秒间隔）+ FOR UPDATE SKIP LOCKED
- **Embedding 抽象放弃 dyn trait**：Rust 的 impl Trait 在 return position 不支持 dyn object。当前用具体类型 Arc<SiliconFlowEmbedder>，trait 保留为文档引用。未来换模型只需替换具体类型

### 架构决策

- **导入管道采用 Dependency Inversion + Hexagonal Architecture 的 Driven Port 模式**：核心定义 trait，外部实现，注册表路由 MIME type → handler
- **独立子项目策略**：MinerU（已有现成 CLI）和视频处理（需自己写 ffmpeg+whisper 管道）通过 ExternalCliHandler 接入，不进入 Rust 核心 crate

---

## Context for Next Session

### 立即可做的事情

**unblocked**：完成 import 管道的剩余代码——HandlerRegistry + ExternalCliHandler + 纯文本 handler + 图片 handler + POST /import 端点。这 5 个组件的代码量预估在 200 行以内，可以在一个 session 内完成。

**需要新开 L2 thread**：MinerU CLI 子应用和视频 PPT+字幕提取 CLI 子应用各自是独立子项目，不在 Xenica 仓库内，需要各自的 scope。

### 运行时注意事项

- Docker PG 用 `docker compose up -d` 启动，首次需等 10 秒等 init 脚本执行
- API 密钥在 `backend/.env` 的 `SILICONFLOW_API_KEY`，已配真实密钥
- 原生 PG（5432）和 Docker PG（5433）共存——后端连 5433
- 启动后端前确保 Docker PG healthy：`docker ps --filter "name=xenica"`

### 未完成的 scope 项

参考 scope.md 终止条件 #7 和 #8。

---

## Immediate Next Steps

1. 本 thread 结束。下一个 session 可以直接开始补 import 管道代码（HandlerRegistry + ExternalCliHandler + POST /import）
2. 之后开独立 L2 thread 分别做 MinerU 子应用和视频处理子应用
3. Phase 2 结束后回到 L1 做 progress-review，检查终止条件完成度
