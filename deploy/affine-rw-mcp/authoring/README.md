# AFFiNE MCP 原生创作适配

固定上游见 [source.json](source.json)，公开工具许可清单见 [policy.json](policy.json)。已有 6 项文档工具保留，新增 21 项读取、36 项创作工具；合计 63 项。决定见 [ADR 0021](../../../docs/adr/0021-affine-native-authoring.md)。

## 构建与隔离验证

只在 `infra-server` 执行。使用第三方固定提交的 Git checkout，`build.py` 从该提交导出源码，在临时目录应用 [兼容补丁](upstream-0.27.4.patch)，按锁文件构建；忽略 checkout 中未提交的研究修改。镜像只包含锁定库和本目录适配代码，不安装/调用第三方独立 HTTP、OAuth 或 CLI 服务。MIT 许可原文保留在镜像。Infra 可用固定 npm 镜像站，包摘要仍按原 lockfile 校验；Dockerfile 默认官方 npm 源。

```sh
python3 deploy/affine-rw-mcp/authoring/build.py \
  /opt/xenica-workspace/research/91-affine-mcp-server xenica-affine-authoring:91
python3 deploy/affine-rw-mcp/authoring/prepare-sandbox.py
docker compose --env-file /mnt/HDD/affine-mcp-91-sandbox/compose.env \
  -f deploy/affine-rw-mcp/authoring/sandbox.compose.yaml up -d
UPSTREAM_ROOT=/opt/xenica-workspace/research/91-affine-mcp-server \
  node deploy/affine-rw-mcp/authoring/bootstrap-sandbox.mjs
```

沙箱独占本机 `3091`、独立 PG/Redis/附件目录和合成账号；内部网络只由固定目的端口转发器连接本机浏览器。`prepare-sandbox.py` 不覆盖已有凭据。不要向沙箱挂载正式存储或导入原账号。

沙箱适配配置由 bootstrap 保存于私有 `adapter.json`。容器测试副本仅将 `state_path` 改为 `/state/authoring.sqlite3`，配置与状态目录所有者为 `65532:65532`、权限 `0600/0700`；适配服务可在主机网络绑定 `127.0.0.1:8893`，访问固定沙箱 URL。源码试跑可直接提供 `UPSTREAM_ROOT` 与 `AFFINE_AUTHORING_CONFIG`，但镜像验证必须单独完成。

```sh
UPSTREAM_ROOT=/opt/xenica-workspace/research/91-affine-mcp-server \
  node --test deploy/affine-rw-mcp/authoring/adapter.test.mjs
node deploy/affine-rw-mcp/authoring/live-security.mjs
node deploy/affine-rw-mcp/authoring/live-compatibility.mjs
```

后两个脚本硬性限制沙箱 URL，使用合成数据，逐项调用全部启用工具。验证重启前后幂等回放、不同客户端键隔离、旧版本拒绝、复杂块保留、图片像素摘要及任意 URL/工作区拒绝。网页还须验证数字列、中文导图、折叠/展开和附件真实呈现；接口回读不能代替这些检查。

第三方原始 `npm test` 的未采用 HTTP readiness 测试在本次基线失败（预期 503、实际 200）；不能声称其完整 fast suite 通过。本适配不运行那套 HTTP 入口。实际采用的原生库相关 24 组回归、本目录专项测试、网关 OAuth 测试和真实沙箱分别记录，不以排除测试冒充完整上游通过。

## 升级和回退

1. 先运行既有 `backup.py`，保留当前 Compose、`.env`、`gateway.json`、所有镜像内容身份。AFFiNE 数据库/附件继续按原保护链备份。
2. 新适配私有配置 `/etc/affine-rw-mcp/authoring.json` 从原桥接配置复用同一固定工作区/所有者/内部密钥，`state_path=/state/authoring.sqlite3`、`port=8893`；不要将客户端 token 转发给后端。
3. 设置 Compose 的 `AUTHORING_IMAGE` 为实测镜像内容身份，先仅启动 `authoring`，健康检查确认真实上游身份。稳定应用和原 bridge 不参与升级。
4. 网关私有配置增加 `authoring_url=http://authoring:8893`，`GATEWAY_IMAGE` 使用新固定内容身份，再仅更新 `gateway`。由 `edge.py` 精确升级原标记块：只有 `/rw-mcp` 请求上限改为 8 MiB，授权路由继续 150 KiB。脚本拒绝未知 vhost 差异。
5. 两端刷新工具清单/按需重连，分别验证真实识图与原生写入，网页刷新与独立回读；新三库备份需完成异地主机/云端往返、解密与 SQLite 完整性检查。

原生状态位于 `/mnt/HDD/affine-rw-mcp/authoring/authoring.sqlite3`，已纳入原 `backup.py`。恢复时除原 `writes.sqlite3`、`oauth.sqlite3` 外恢复该文件；停止三个 MCP 容器后恢复在线快照主文件，不能混用旧 WAL/SHM。原生意图/结果含文档内容，始终只作私有备份。

回退恢复保存的原网关镜像、网关私有配置及旧 Compose/`.env`，仅更新旧 gateway，再停止新 `authoring`；不删除原生状态、OAuth 状态或已写入的文档。完整状态回退沿用原维护手册，恢复旧授权快照后须撤销旧 grant 并重连。不要整份覆盖 vhost，保留其他会话后来新增的配置。

## 使用边界

- 原生写入要求 `idempotency_key`；带 `expectedRevision` 的工具必须先 `read_doc`。旧工具继续用旧版本字段。读写在网关单进程与新服务工作区队列协调，网页编辑不共享此锁；上游没有原子 CAS，组合操作可能部分完成。
- 同键同参数只回放结果；持久意图未确认时返回 `WRITE_OUTCOME_UNCERTAIN`，必须回读协调，不能另换键盲重试。OAuth client_id 隔离幂等键。
- `inspect_document_assets` 返回文档内图片块/附件；`read_image(docId, blockId)` 返回实际 PNG/JPEG/GIF/WebP 图像内容。下载限定固定上游、拒绝重定向、最大 4 MiB；MCP 整体请求最大 8 MiB。其他格式附件可上传/插入，不宣称解析任意 PDF/Office。
- 上传以字节 SHA-256 的 base64url 为存储 key，避免 0.27.4 按 multipart 文件名保存导致同名覆盖。附件显示名由原生附件块 `name` 保存。
- 原生导图节点是文字形状，支持左右/平衡布局，不能将图片当成层级节点；独立图片不随分支折叠。兼容补丁补齐数字列数据默认值、中文节点宽度与折叠后代 `hidden` 状态。
- `search_docs` 为标题搜索；旧 `doc_search` 仍为有上限的标题/正文实时扫描。没有新增全文索引。
- 不开放永久删除、公开发布、账号管理、跨工作区或任意代码工具。旧 Markdown 整篇修改继续拒绝复杂内容。
