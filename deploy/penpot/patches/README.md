# Penpot 2.18.3 官方多会话回移

- 原始功能：penpot/penpot#11927，提交 `8efbd9b5d3fc7f3b0b174efcc6c665033318dcad`。
- 基线：2.18.3，提交 `ff7a66f51938b2293260ea27a64e2c4e0833b5e3`。
- `11927-multi-session.patch` 是原始官方补丁，SHA256 `2acf4d7b0a685b0afc1226577ffc33954f2f86579fe006def24a7191d80ffbd3`。
- `11927-stable-backport.patch` 是本站实际源码差异，已在干净基线上通过 `git apply --check`。含同一官方提交的 `ReconnectPolicy`、前端异步测试助手、菜单中英文翻译和版本元数据；排除依赖 SDK 2 的 HTTP 测试，使用 diagnostics 中的 SDK 1 实际服务测试代替。

只在 Infra 构建。将干净的固定基线应用兼容补丁；使用官方 devenv 镜像 `sha256:4a80b2de5c1c49df56f4557afd3a472f2b693a9beb559262ed9537ee13e4c227`，Node 24、项目固定 pnpm、Java/Clojure，保留原锁文件。

MCP 在 `mcp/` 安装依赖，依次构建 `mcp-common`、检查和构建 `mcp-server`，以 `WS_URI=/mcp/ws` 构建 `mcp-plugin`。其运行依赖未变，镜像继承原版依赖。

前端安装固定依赖并运行 postinstall；保留原版渲染器二进制和由原版 shared.js.map 恢复的生成 API，避免改变 WASM ABI。所有前端构建步骤均设置 `NODE_ENV=production VERSION=2.18.3 VERSION_TAG=2.18.3-ms11927-r2`，依次运行 `build:app:assets`、`clojure -M:dev:shadow-cljs release main worker`、`build:app:libs`。打包前执行 `python3 diagnostics/verify_frontend_artifact.py <frontend/resources/public>`。

插件 host 使用 `plugins/mcp/<VERSION_TAG>/`，Dockerfile 必须包含这个版本目录。旧地址有七天浏览器缓存，直接覆盖文件会出现新版前端运行旧插件、显示已连接却没有服务端会话的错误；仅更换主应用缓存标记不足以修复。

构建上下文：`frontend/` 为前端 public 产物，`plugin/` 为插件 dist，`server/` 为服务 dist；使用本目录两个 Dockerfile。保留基线镜像其余内容和站点现有挂载。部署必须引用实际构建的不可变摘要，不能使用浮动标签；不更换后端、导出器、管理端、Valkey 或数据库。

验证和回退入口见 [运行记录](../../../docs/context/penpot-multi-session.md)。上游 Node 测试含日志 worker 导致正常退出等待，本站使用 Node 的 `--test-force-exit`，并确认没有 skipped/cancelled；不能把超时中止算作通过。
