# Xenica

个人知识系统：把资料（PDF、笔记、题目……）拆成节点，用关系连起来，在图上导航、在面板里阅读和编辑。

**以代码为事实，以仓库为唯一标准。** 本文件只写代码里看不出来的东西；理由见 `docs/adr/`（流程见 0006）。

接续先读 `docs/context/index.json`：区分确认决定、参考建议、历史与待验证事项。继续已有任务时复用关联工作区和 PR；开放 PR 不等于别人正在执行。长期候选、自检、验收与上线证据在同仓库 `delivery-records` 分支索引。范围见 `specs/54-delivery-system/spec.md`。

## 接到任务时（所有 Agent 先读）

开场白通常只有一句「处理 #<号>」。按顺序做：

1. **读 Issue。** 意图或验收标准不清 → 在 Issue 里提具体问题，然后停下，不要猜。
2. **看锁。** 已经有关联这个 Issue 的打开 PR → 别人在做，停下。
3. **定规模与开始前审核。** 小（一个组件、一个缺陷、文案）：直接做。中（一个视图、前后端都动）：把行为与可截图/可测试的验收标准写进 `specs/<号>-<名>/spec.md`。大（新原语、跨模块）：规格 + ADR，拆成子 Issue。若 Agent 已在对话复述范围、用户确认并说「开始」，Scope 审核即完成，直接实施，不再要求第二次规格确认；未确认范围时才先提仅含规格的 PR 等确认。执行中实质扩大范围须重新确认。
4. **认领 = 立刻开草稿 PR**：分支 `<号>-<短名>`，正文按模板，写 `Closes #<号>`。
5. **实现。** 缺陷先写一个会失败的测试再修。只有有特色的组件单独做 story；通用细节不单独隔离，放在整体预览里看。
6. **全面自检。** 在 Infra 跑「命令」里的全部检查，按规格逐项测试真实部署的正常/异常交互、刷新持久化和相关权限/冲突；外观改动必须亲眼看桌面/窄屏截图。失败继续修复。按 `docs/task-lifecycle.md` 记录对应成果的场景与证据，未全部通过不得转 Ready 或请用户验收。
7. **自检门通过后填「沉淀」，转为 Ready for review。** 结束后，后端等无需亲自体验的成果由 Agent 与 CI 验证，全绿且无需验收就自动合并；交互成果须给出预览，等用户动手体验、确认通过后再合并（见下）。开始前的 Scope 确认不能代替结束后的体验验收。
8. **被退回**：按 PR 评论修改，推到同一分支。

禁止：用户没在对话里明确确认就评论 `/通过`、自己合并、直接推 master、改 `.github/` 来绕过检查。

### 请用户验收时

先确认全部 Agent 实测和自动检查通过，没有待用户排查的问题；用户只看整体体验，不看 Issue、PR 和代码。在对话里给他：

1. **网址**（固定开发画板 `/sketch`，沿用 test 账户；嵌入免再次登录，独立测试站仍需鉴权。页面不公开凭据）。
2. **这次实现了什么**：一两句，说体验，不说实现。
3. **看哪里、怎么试**：按他真实的使用场景给几步。
4. **注意什么**：已知的不足、这次故意没做的。

不提 Issue/PR 号、分支、CI。他在对话确认体验后，Agent 绑定实际源码、产物与产品身份，记录验收原话、会话来源和时间（格式见 `docs/task-lifecycle.md`）。无身份或无原话来源不放行；开始不能登记为成果验收。他提的意见按 PR 评论处理。

### 版本与命名

按体验切版本：`v0.2.0`、`v0.2.1`……一个体验版本可包含多个 Issue/PR，Milestone 汇总范围；Project 的任务完成指合并，发布状态单独记录。PR 标题和提交信息用 Conventional Commits。

合并只集成与校验，不自动上线。用户明确要求发布后，Agent 执行 `release.yml`，核对已验收产物、最新检查、备份及两个固定入口；成功才创建不可移动的版本 Tag、清单附件和 GitHub Release。当前前后端版号、`releases/<版本>.json` 和发布说明须一致；不补造未发布的历史。详见 `docs/adr/0015-versioned-release.md` 与 `docs/task-lifecycle.md`。

提 Issue 时用 `.github/ISSUE_TEMPLATE/` 的格式，类型四选一：试样、功能、缺陷、流程。

## 目录

```
crates/core     领域模型：原语 + 规则。不依赖数据库/网络/运行时（scripts/check-arch.sh 检查）
crates/store    PostgreSQL 存储。migrations/ 是唯一的表结构来源；每次写入同事务写一条痕迹
crates/server   HTTP：JSON API（OpenAPI 由代码生成）+ 托管 web/dist。二进制名 xenica
web/src/ui      设计变量与基础组件（叶子层，不 import 别的层）
web/src/api     唯一能请求后端的地方。schema.d.ts 是生成的
web/src/shell   工作台外壳：停靠面板、侧栏、命令面板、状态栏。对视图只开放 shell/api.ts
web/src/views   视图，一个目录一个，互相不 import
web/src/sketch  草图站点：独立域名那一个页面（画布 + 分享链接），只用 api/ 和 ui/
deploy/         compose.yaml（一个实例）、edge/（Traefik）、deployer/（core-server 上的部署器）
specs/          中/大规模任务的规格
.github/        CI、验收门（scripts/gate.cjs）、看板同步、Issue/PR 模板
docs/adr/       设计决策
```

## 命令

需要：Rust（版本见 rust-toolchain.toml）、Node 24、pnpm、PostgreSQL 18。`XENICA_SEED=demo` 会在空库里导入示例数据（`crates/server/fixtures/demo.json`，预览站也用它）。

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
pnpm e2e           # 需要后端在 :8080 运行（XENICA_WEB_DIST=web/dist）
pnpm screenshots   # 先 pnpm build-storybook；基准以 CI 容器里 master 的截图为准
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

- 只做暗色。颜色、字号、圆角、阴影、时长只用 `web/src/ui/theme.css` 的刻度（总览见 story「底座/设计变量」）；lint 禁止写死颜色、任意值 `text-[12px]` 和刻度外的类名 `text-sm`。可交互的一行用类名 `item`。
- 写入一律经过 `Store`，它负责记痕迹；不要绕过它直接写表。
- 改表只加新迁移，不改已有迁移。改了 SQL 要更新 `.sqlx/`（见下）。
- 不写大段说明文档。理由写进 ADR，一条决策一个文件，短。
- 文案用中文，词汇：节点、块、页、标记、关系、锚点、位置、痕迹、视图、处理器。
- 不强迫结构：标题可以为空，属性就是节点（`#必备` 连到名为「必备」的节点），结构是看法（见 ADR 0008）。

## 配方

**加接口**：照 `crates/server/src/routes/nodes.rs` 写 handler（带 `#[utoipa::path]`；`/api` 默认要登录，写数据时用参数 `user: CurrentUser` 记痕迹，见 ADR 0007）→ 在 `lib.rs` 的 `api_router()` 注册 → 在 `crates/server/tests/api.rs` 加测试 → 重新生成前端类型：

```sh
cargo run -p xenica-server -- openapi > web/src/api/openapi.json && pnpm -C web api
```

**改 SQL**：新建 `crates/store/migrations/<时间戳>_<名字>.sql` → `cargo sqlx migrate run --source crates/store/migrations` → `cargo sqlx prepare --workspace`，提交 `.sqlx/`。

**加视图**：新建 `web/src/views/<名字>/index.ts`，用 `defineView` 定义（参考 `views/node`）→ 加进 `views/index.ts`。视图只能 import `shell/api.ts`、`api/`、`ui/`；跳到别的视图用 `useWorkbench().openView(id, params)`。

**加命令**：写在视图定义的 `commands` 里，命令面板（Ctrl K）自动收录。

**加组件**：放 `web/src/ui/`，写一个 `*.stories.tsx`，从 `ui/index.ts` 导出。

## 仓库设置（一次性）

`bash scripts/setup-github.sh`：只允许 squash；master 必须走 PR，`rust/web/e2e/docker/screenshots/preview/delivery-history/验收` 必须通过，禁止强推和删除；启用不可变 Release。需要仓库管理权限。验收门故障保留失败记录，修复及负向回归完成后再放行，不能停用保护来伪造通过。

Secrets：`PROJECT_TOKEN`（Projects 读写，看板同步用）。

## 部署

```
浏览器 → *.xenica.truebigsand.top（Cloudflare，仅 DNS）→ hikari（1Panel：证书 + 反代，保留 Host 头）
       → Tailscale → core-server 100.100.1.103:8080 → Traefik（deploy/edge）
           ├─ xenica.truebigsand.top → 正式站（compose 项目 xenica）
           ├─ excalidraw.xenica.truebigsand.top → 独立持久画板（项目 xenica-sketch，ADR 0014）
           ├─ preview.xenica.truebigsand.top → 最近更新的那个 PR 预览
           └─ pr-<号>.xenica.truebigsand.top → PR 预览（compose 项目 xenica-pr-<号>，示例数据）
```

core-server 上，仓库 checkout 在 `/opt/xenica`，部署器由 systemd timer 每 2 分钟运行：

```sh
cd /opt/xenica/deploy && cp .env.example .env     # 填 POSTGRES_PASSWORD；XENICA_BIND=100.100.1.103
docker network create xenica-edge
(cd edge && docker compose --env-file ../.env up -d)
sudo cp deployer/xenica-deployer.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now xenica-deployer.timer
journalctl -u xenica-deployer -f                   # 看部署日志
```

部署器仅接受与永久发布请求、当前主线匹配的镜像摘要，先备份再推广，失败回滚并保存证据。追加审计记录和短期测试密文使用既有部署凭据；原始数据库留在私有持久目录。同仓库打开 PR 有独立 test 预览，关闭前先归档数据；固定画板与历史档案不随 PR 删除。历史控制器自动发现支持恢复接口的实例，跳过旧版本。回滚使用已保存的不可变 digest。

首次建库使用服务日志中的一次性设置码创建账号。固定画板与私有预览沿用已有 test 凭据；嵌入免重复登录，独立打开仍须鉴权。自动测试用两小时短期会话，缺失授权即失败，详见 `docs/task-lifecycle.md`。

备份：`docker compose -p xenica exec db pg_dump -U xenica xenica > backup.sql`。
