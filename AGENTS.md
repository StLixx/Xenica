# Xenica

个人知识系统：把资料（PDF、笔记、题目……）拆成节点，用关系连起来，在图上导航、在面板里阅读和编辑。

**以代码为事实。** 本文件只写代码里看不出来的东西；为什么这样设计见 `docs/adr/`。

## 目录

```
crates/core     领域模型：原语 + 规则。不依赖数据库/网络/运行时（scripts/check-arch.sh 检查）
crates/store    PostgreSQL 存储。migrations/ 是唯一的表结构来源；每次写入同事务写一条痕迹
crates/server   HTTP：JSON API（OpenAPI 由代码生成）+ 托管 web/dist。二进制名 xenica
web/src/ui      设计变量与基础组件（叶子层，不 import 别的层）
web/src/api     唯一能请求后端的地方。schema.d.ts 是生成的
web/src/shell   工作台外壳：停靠面板、侧栏、命令面板、状态栏。对视图只开放 shell/api.ts
web/src/views   视图，一个目录一个，互相不 import
deploy/         compose.yaml + .env.example
docs/adr/       设计决策
```

## 命令

需要：Rust（版本见 rust-toolchain.toml）、Node 24、pnpm、PostgreSQL 18（或 `docker compose -f deploy/compose.yaml up -d db`）。

```sh
export DATABASE_URL=postgres://xenica:密码@localhost:5432/xenica
cargo run -p xenica-server            # 后端 :8080，启动时自动迁移
pnpm -C web install && pnpm -C web dev # 前端 :5173，/api 转到 :8080
pnpm -C web storybook                  # 组件 :6006
```

提交前，CI 跑的就是这些：

```sh
cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
bash scripts/check-arch.sh
cd web && pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm arch && pnpm build
pnpm e2e   # 需要后端在 :8080 运行（XENICA_WEB_DIST=web/dist）
```

## 规则

1. 原始数据不可变，派生数据可重算。
2. AI 只提议，人裁决。
3. 结构是视图，不是存储：存的是节点和关系，树、图、列表都是看法。
4. ID 全局唯一、可离线生成（UUID v7）。
5. 核心只认原语；内置功能也走和插件一样的接口。
6. 插件先声明（manifest）再加载。
7. 配置也是知识：设置项是节点，有来源、版本和痕迹。
8. 每个设置都带预览或示例，并说明会影响什么。
9. 密钥不进图，只进密钥库。

写代码时的约束：

- 只做暗色。颜色只用 `web/src/ui/theme.css` 里的变量（lint 禁止写死十六进制颜色）。
- 写入一律经过 `Store`，它负责记痕迹；不要绕过它直接写表。
- 改表只加新迁移，不改已有迁移。改了 SQL 要更新 `.sqlx/`（见下）。
- 不写大段说明文档。理由写进 ADR，一条决策一个文件，短。
- 文案用中文，词汇：节点、关系、锚点、位置、痕迹、视图、处理器。

## 配方

**加接口**：照 `crates/server/src/routes/nodes.rs` 写 handler（带 `#[utoipa::path]`）→ 在 `lib.rs` 的 `api_router()` 注册 → 在 `crates/server/tests/api.rs` 加测试 → 重新生成前端类型：

```sh
cargo run -p xenica-server -- openapi > web/src/api/openapi.json && pnpm -C web api
```

**改 SQL**：新建 `crates/store/migrations/<时间戳>_<名字>.sql` → `cargo sqlx migrate run --source crates/store/migrations` → `cargo sqlx prepare --workspace`，提交 `.sqlx/`。

**加视图**：新建 `web/src/views/<名字>/index.ts`，用 `defineView` 定义（参考 `views/node`）→ 加进 `views/index.ts`。视图只能 import `shell/api.ts`、`api/`、`ui/`；跳到别的视图用 `useWorkbench().openView(id, params)`。

**加命令**：写在视图定义的 `commands` 里，命令面板（Ctrl K）自动收录。

**加组件**：放 `web/src/ui/`，写一个 `*.stories.tsx`，从 `ui/index.ts` 导出。

## 仓库设置（一次性）

`bash scripts/setup-github.sh`：只允许 squash 合并；master 必须走 PR、CI（rust/web/e2e/docker）必须通过、禁止强推和删除。需要 `gh` 已登录且有管理员权限。可重复运行。

依赖更新用 Renovate（`renovate.json`）。安装 GitHub App 必须由用户在浏览器里点：https://github.com/apps/renovate → Install → 只选 Xenica。

## 部署

```
浏览器 → xenica.truebigsand.top（Cloudflare，仅 DNS 不代理）
       → hikari（1Panel + OpenResty：证书 + 反代）
       → Tailscale → core-server 100.100.1.103:8080（Docker：app + postgres）
```

部署 Agent 需要：SSH 到 core-server；环境变量 `CLOUDFLARE_API_TOKEN`（只有 truebigsand.top 的 DNS 编辑权限）；1Panel 的 API 密钥（1Panel 面板 → 设置 → API 接口，开启并把 Agent 所在机器的 IP 加白名单）。这些都不写进仓库、不贴进聊天。

1. **应用**（core-server）：

   ```sh
   cd deploy && cp .env.example .env   # POSTGRES_PASSWORD=$(openssl rand -hex 24)；XENICA_BIND=100.100.1.103
   docker compose pull && docker compose up -d
   docker compose ps                   # app 显示 healthy
   curl -s http://100.100.1.103:8080/api/health
   ```

   拉不到镜像就在 GitHub 把 ghcr 包 `xenica` 设为公开，或者 `docker compose build` 本地构建。

2. **DNS**：用 Cloudflare API 建（或更新）A 记录 `xenica.truebigsand.top` → hikari 公网 IP，`proxied: false`。

3. **证书和反代**（hikari，走 1Panel API，不要手改 OpenResty 配置，否则 1Panel 会覆盖）：
   - 证书：用 Cloudflare DNS 账户（同一个 token）申请 `xenica.truebigsand.top` 的 Let's Encrypt 证书，开自动续期。
   - 网站：反向代理到 `http://100.100.1.103:8080`，绑定上面的证书，开 HTTPS 和 HTTP→HTTPS 跳转。
   - 接口以 1Panel 自带的 API 文档为准（面板里 API 接口页有链接），版本不同路径不同。

4. **验收**：`curl -s https://xenica.truebigsand.top/api/health` 返回 ok，浏览器打开能看到工作台。

更新：master 合并后 CI 推送 `ghcr.io/stlixx/xenica:latest` 和 `:<commit>`，在 core-server `docker compose pull && docker compose up -d`。回滚：`.env` 里 `XENICA_IMAGE` 改成旧 commit 的标签再 `up -d`。

备份：`docker compose exec db pg_dump -U xenica xenica > backup.sql`。
