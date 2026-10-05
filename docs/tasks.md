# 任务

状态有四种：待做、进行中、完成、搁置。新会话选第一个依赖全部完成的「待做」任务。

## Phase 1：Demo 1，Web 上的任务依赖图

**完成标准**：用手机浏览器打开部署好的地址，依次完成：建任务 → 连依赖 → 整理 → 拖动 → 刷新后位置还在 → 勾掉一个任务后，下游任务变成可做。

### T-01 仓库骨架与验证闭环

- 状态：待做 · 依赖：无
- 目标：建好空的 monorepo，让 `pnpm check` 和 CI 跑通。
- 范围：根目录配置、`server/`、`packages/`、`apps/web/`、`.github/`
- 上下文：`docs/architecture.md` 的「技术栈」和「目录」
- 前置：先确认用户本机装有 Docker、Rust stable、Node 24 和 pnpm。缺什么，就先列出安装步骤让用户装。
- 交付：
  - pnpm workspace，以及包含 4 个空 crate 的 Cargo workspace
  - `docker-compose.yml`（PostgreSQL 17）
  - `apps/web`：空的 Vite + React + TS 页面
  - Playwright 冒烟测试：打开首页并截图
  - 根脚本 `dev` 和 `check`
  - 在 PR 上运行 `pnpm check` 的 GitHub Actions
- 验收：本机 `pnpm check` 通过；PR 上 CI 为绿；截图作为 CI artifact 上传。
- 交接：

### T-02 契约 v1 草案

- 状态：待做 · 依赖：T-01
- 目标：写出 Phase 1 所需的全部端点，并生成 TS 类型。
- 范围：`contracts/`、`packages/client-core/`（只放生成的类型）
- 上下文：`docs/architecture.md` 的「数据模型」和「不变量」；`docs/prototypes/taskgraph-v0.html`（看交互需要哪些操作）
- 交付：
  - 节点和边：创建、更新、删除、列表
  - 视图和 ViewItem：读取，以及批量更新位置
  - `GET /v1/sync?since=`
  - 健康检查、Bearer token 认证、统一的错误格式
  - Redocly lint 和类型生成，都接入 `pnpm check`
- 验收：`pnpm check` 通过。
- 注意：这是不可变层的起点。合并前要先把草案给用户过目。
- 交接：

### T-03 数据库 schema 与 storage

- 状态：待做 · 依赖：T-02
- 目标：建表并写好仓储层，测试连真实的 PostgreSQL。
- 范围：`server/crates/storage`、`server/crates/domain`（只放实体类型）
- 上下文：`contracts/openapi.yaml`、`docs/architecture.md` 的「数据模型」
- 交付：
  - 首个 migration：nodes、edges、views、view_items 和全局序列
  - 增删改查，以及按 `since` 查询
  - 对应的测试
- 验收：`cargo test` 通过。
- 交接：

### T-04 API 服务

- 状态：待做 · 依赖：T-03
- 目标：按契约实现全部端点。
- 范围：`server/crates/api`、`server/crates/domain`、`server/crates/xenica-server`
- 上下文：`contracts/openapi.yaml`
- 交付：
  - 路由和认证中间件
  - `domain` 层的无环校验
  - 集成测试，以及校验响应是否符合 OpenAPI 的契约测试
- 验收：`pnpm check` 通过，每个端点的成功路径和主要失败路径都有测试。
- 拆分提示：一个会话做不完时，拆成「节点与边」和「视图与同步」两张卡。
- 交接：

### T-05 client-core

- 状态：待做 · 依赖：T-02（可以和 T-03、T-04 并行，先用 mock）
- 目标：做出 Web、Desktop、Mobile 共用的数据层。
- 范围：`packages/client-core`
- 上下文：`contracts/openapi.yaml`
- 交付：
  - 基于 openapi-fetch 的 API 客户端
  - 派生状态：可做、等待（含等待几项）、完成
  - 本地无环预检
  - 把 sync 拉到的增量合并进本地缓存
  - Vitest 测试
- 验收：`pnpm check` 通过。
- 交接：

### T-06 Web 外壳与设计 token

- 状态：待做 · 依赖：T-01
- 目标：做出应用外壳和暗色主题。以后换风格时只改 token。
- 范围：`apps/web`
- 上下文：`docs/prototypes/taskgraph-v0.html`（参考配色和布局，不复用代码）
- 交付：
  - 用 CSS 变量定义的 token：颜色、圆角、间距、字体
  - 顶栏加画布的布局，以及空状态
  - Playwright 截图：桌面 1280 和手机 390
- 验收：`pnpm check` 通过，并且看过截图。
- 交接：

### T-07 任务图视图

- 状态：待做 · 依赖：T-05、T-06
- 目标：用正式技术栈实现原型 v0 的交互，并接上真实后端。
- 范围：`apps/web`
- 上下文：`docs/prototypes/taskgraph-v0.html`、`packages/client-core` 的导出
- 交付：
  - React Flow 画布
  - 添加、改名、勾选完成、连线（成环时给出提示）、删除
  - 拖动后保存位置
  - 「整理」：用 ELK.js 做分层布局
  - 高亮可做的任务
- 验收：Playwright 覆盖 Demo 1 完成标准的整条链路（包括刷新后位置还在），并且看过截图。
- 拆分提示：可以拆成 T-07a「只读渲染与布局」和 T-07b「编辑交互」。
- 交接：

### T-08 部署（用户主导）

- 状态：待做 · 依赖：T-04、T-07
- 目标：部署到服务器，让手机能访问。
- 范围：`deploy/`、各 Dockerfile
- 交付：
  - 后端镜像和 Web 静态构建
  - 用 Caddy 做反向代理并开启 HTTPS
  - 用 compose 文件或脚本记录部署步骤
- 方式：由用户亲手操作，Agent 只解释每一步并帮忙排错。
- 验收：在手机浏览器上走通 Demo 1 的完成标准。
- 交接：

## 以后（只列方向，不拆卡）

- 列表视图：验证同一份数据在多个视图中的同一性
- 节点详情面板和更多属性：时间、地点、附件
- 实时推送与多端即时同步
- Electron 桌面端
- 离线编辑
- Mobile 端
- 地点与触发器类场景，例如南图
