# 0001 技术栈

状态：已采纳 · 2026-10

## 决定

- 后端 Rust（axum + sqlx + PostgreSQL 18），单个二进制同时提供 API 和前端静态文件。
- 前端 React + TypeScript + Vite，Tailwind 4，dockview（停靠面板），React Flow（图），TanStack Query（数据请求）。
- 接口契约：OpenAPI 由后端代码生成（utoipa），前端类型由它生成（openapi-typescript），CI 检查两边一致。
- 组件用 Storybook 开发和验收，端到端用 Playwright。

## 理由

- 这是第五次重构，目标是结构不随功能增长而腐烂，所以选**类型强、边界能被机器检查**的组合：Rust 的类型系统 + sqlx 编译期检查 SQL + 生成的接口类型 + dependency-cruiser。
- 之后大部分代码由不同的 AI 模型写。机器能检查的约束比文档可靠：写错了 CI 会红，而不是靠模型读懂说明。
- PostgreSQL：节点和关系就是表，JSONB 放灵活字段，以后全文搜索、向量（pgvector）都在同一个库里。
- 单容器部署：一台家用服务器，越少的运动部件越好。

## 放弃的方案

- SQLite：单机够用，但以后多端同步、全文和向量搜索都要换。
- Next.js / SSR：这是工作台式的单页应用，不需要服务端渲染；多一层 Node 服务只增加部署成本。
