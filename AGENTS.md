# AGENTS.md

## 架构图约束
- 开发前**必须**读取 `architecture/` 下所有 `.excalidraw.md` 文件
- 架构图中列出的组件、服务、依赖关系为**唯一真相源**
- 图中没有的组件、服务、依赖，**不允许引入**

## Excalidraw 编写规范
- 生成或修改 Excalidraw 图表时，严格遵循 `docs/@obsidian-agent/excalidraw-spec.md`
- 图表文件统一放在 `architecture/` 目录下
- 文件扩展名 `.excalidraw.md`，插件设置中关闭 JSON 压缩（compress = false）

## 技术栈
- 后端: Rust + Axum + sqlx — 参考 `docs/architecture-rules.md`
- 数据库: PostgreSQL + pgvector
- 前端: 待定（参考 `docs/` 下的讨论记录）

## 项目结构
- `architecture/` — 架构图，Agent 的开发约束来源
- `docs/@obsidian-agent/` — 当前技术方案和配置记录
- `docs/used-experience/` — 参考软件的使用体验记录
- `docs/deprecated-v1/` — Git `deprecated-v1` 分支的旧设计文档（过时，仅供参考）
- `tests/` — 调研和测试代码

## 关键配置
- Obsidian 附件路径: `obsidian-assets/attachments/`
- Excalidraw 压缩: **关闭**（compress = false，确保 AI 可读写明文 JSON）
- Excalidraw 素材库: 存储在 `.obsidian/` 中，迁移时复制整个 `.obsidian/` 即可
