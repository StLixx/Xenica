# AFFiNE 读写 MCP 部署与维护

固定入口：`https://affine.truebigsand.top/rw-mcp`。ChatGPT Plugin 与 Notion AI 的连接名均为 **AFFiNE Read Write**，认证选择 OAuth。已有连接已经完成两端真实读写；旧 `AFFiNE` 条目属于之前已停用的只读试验，不替换它的凭据或路由。

决定与边界：[ADR 0020](../../docs/adr/0020-affine-read-write-mcp.md)。长期接续：[读写 MCP](../../docs/context/affine-rw-mcp.md)。验证与精确身份：[evidence.json](evidence.json)。原稳定应用、PostgreSQL 与附件保护链继续见 [AFFiNE 运维](../../docs/context/affine-operations.md)。

## 原生创作扩展（任务 #91）

在原 6 项工具上新增 57 项原生工具；块、表格/数据库、图片像素、导图/白板及整理能力见 [原生适配手册](authoring/README.md)、[固定上游](authoring/source.json) 与 [实测证据](authoring/evidence.json)。独立 `authoring` 服务复用固定所有者/工作区和 OAuth 网关，配置/状态新增同名目录；三个 SQLite 纳入备份。以下原桥接的能力与测试数量是初版基线，新扩展与当前数量以该手册和证据为准。旧 Markdown 整篇替换仍保留复杂块保护。

## 部署结构

| 部件            | 源码 / 位置                                                                                     | 职责                                                             |
| --------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| AFFiNE 0.27.4   | 原 `affine-server`                                                                              | 网页、认证、CRDT 同步与持久化，未更换或重启                      |
| Node 桥接       | [用户 AFFiNE Fork](https://github.com/StLixx/AFFiNE/tree/xenica/mcp-rw-0.27.4/tools/xenica-mcp) | 固定所有者 / 工作区，原生文档转换、Socket.IO，同步确认和幂等记录 |
| Python 网关     | 本目录                                                                                          | MCP、OAuth 2.1 / S256 PKCE、所有者授权、权限过滤、刷新与撤销     |
| HTTPS 精确路由  | `edge.py`                                                                                       | 只增加 `/rw-mcp`、`/rw-oauth/` 与对应两个 well-known 地址        |
| 私有配置        | `/etc/affine-rw-mcp/{bridge,gateway}.json`                                                      | 内部凭据、上游账号和固定工作区；不得入 Git                       |
| 状态            | `/mnt/HDD/affine-rw-mcp/{bridge,gateway}/`                                                      | 写入意图 / 结果和 OAuth 状态；包含文档内容，私有备份             |
| 运行 / 维护副本 | `/opt/stacks/affine-rw-mcp/`、`/opt/affine-rw-mcp/source/`                                      | Compose 与仓库内维护脚本的部署副本，不是额外事实源               |

仅 Infra 执行开发与运维。桥接不发布宿主端口；网关绑定 Infra 私有地址与本机 `3043`，hikari HTTPS 反代到它。专用 Docker 网络、只读根目录、资源上限、移除 capabilities 和自动重启只作用于新服务。Python 以 UID/GID `65532` 运行；其配置文件与状态目录所有者须匹配，配置 `0600`、目录 `0700`。不要为了权限错误改为全局可读。

网关配置键：`public_url`、`upstream_url`、`workspace_id`、`owner_id`、`bridge_url`（`http://bridge:8892`）和随机 `bridge_secret`。桥接配置使用相同身份与密钥，另有既有所有者 `email` / `password`；不要把上游登录信息发送给客户端。初次部署通过原私有 bootstrap 登录验证当前身份和唯一工作区后生成配置；未来密码变更须同步私有桥接配置、重建容器并实测。重建前保留原 `bridge_secret` 与数据库，否则幂等身份会改变。

## 构建、升级与回退

Fork 基线是上游 `v0.27.4`：`b4c8548c09da21b2898443559a5b846f0ccf5dd8`。精确实现提交见证据。无需 canary，不启用 Copilot、索引器或模型提供方。升级 AFFiNE/native schema 前重新验证复杂块保护、转换差异、元数据与同步协议；不要只改版本字符串。

```sh
# 在 Infra 的独立 Fork 工作目录执行；不在上游 monorepo 根目录 npm install。
docker build --network=host -t xenica-affine-rw-bridge:<提交> tools/xenica-mcp
docker run --rm --network none \
  -v "$PWD/tools/xenica-mcp/test:/mcp/test:ro" \
  --entrypoint node xenica-affine-rw-bridge:<提交> --test test/documents.test.mjs

# 在本 Xenica 任务工作树执行。
docker build --network=host -t xenica-affine-rw-gateway:<提交> deploy/affine-rw-mcp
docker run --rm --network none \
  -v "$PWD/deploy/affine-rw-mcp:/test:ro" --workdir /test \
  --entrypoint python xenica-affine-rw-gateway:<提交> -m unittest -v test_gateway
```

运行 `.env` 写入实际 `docker image inspect --format '{{.Id}}'` 得到的内容身份，不使用浮动 `latest`。`BASE_IMAGE` 可在网关构建时复用已核对 **29 项依赖完全一致** 的本地镜像缓存；默认从 Dockerfile 固定官方 Python 镜像与锁定依赖重建。首次网络下载停滞时采用了这一路径，最终镜像身份与依赖来源写入证据；它不是必须存在的长期源码依赖。桥接固定官方 AFFiNE OCI digest，使用其同版本 native 转换器。

更新前运行 `backup.py`，记录当前 `.env` 与镜像；更新后重新运行 9 项桥接测试、7 项网关测试、真实客户端只读 / 写入和网页刷新检查。将通过的 Compose、镜像身份和脚本复制到上述独立部署目录，再 `docker compose --project-directory /opt/stacks/affine-rw-mcp up -d`。不执行原 `affine-server` 的重启、Compose 更新或数据库迁移。回退只恢复新网关 / 桥接的旧镜像与兼容状态；用户已经写入的 AFFiNE 文档不会随镜像回退而撤销。

停止新功能可 `docker compose --project-directory /opt/stacks/affine-rw-mcp stop`，关闭两个专用 timer，并精确移除 `BEGIN/END XENICA AFFINE RW MCP` 标记之间的路由。不要整份恢复旧 vhost，避免覆盖其他维护会话后来添加的配置。保留数据库和私有恢复材料；不删除用户文档。

## 日常检查与授权

```sh
python3 /opt/affine-rw-mcp/source/check.py
systemctl status affine-rw-mcp-check.timer affine-rw-mcp-backup.timer
journalctl -u affine-rw-mcp-check.service -u affine-rw-mcp-backup.service --since today
# 默认只查看匹配数量；确认需要撤销后加 --apply。
python3 /opt/affine-rw-mcp/source/revoke.py --client-name Notion
```

`check.py` 每五分钟检查容器健康、上游同步、公开 metadata 和匿名拒绝。Docker 健康检查会访问真实工作区同步；Docker 的自动重启针对进程退出，不等于对所有 unhealthy 状态自动修复。检查失败可从私有日志定位，不把账号、Cookie、令牌或正文贴进公开 Issue。

访问令牌一小时自动刷新；连接最长三十天，到期在客户端重新连接。授权码、刷新令牌一次使用；撤销一个 grant 会使关联访问 / 刷新令牌失效。管理员按准确客户端名称运行 `revoke.py --client-name ChatGPT --apply` 或 `--client-name Notion --apply` 可撤销该客户端全部授权；其他客户端不受影响。客户端应用断开后需要重连才能继续。新增客户端须重新获得工作区所有者同意，不能复用另一客户端的令牌。

## 备份与恢复

`affine-rw-mcp-backup.timer` 每日约北京时间 04:30 执行 `backup.py`。不暂停 AFFiNE；分别使用 SQLite 在线备份接口快照写入 / OAuth 状态，连同私有配置和 Compose 一起 AES256 加密。密钥沿用现有私有 `/etc/pg-ops/backup.key`，不入 Git。密文保存 Infra `/mnt/HDD/affine-rw-mcp/backups/`，复制 core `/var/lib/affine-rw-mcp/backups/` 和既有云账号的专用 `Xenica-private/affine-rw-mcp/`；使用 copyto，不同步删除 PG 或稳定 AFFiNE 的备份。当前不自动清理历史集合。

每次备份核对云端重新下载的密文摘要，再解密独立副本，在临时目录对两个恢复 SQLite 执行 `integrity_check`。`/var/lib/affine-rw-mcp/backup.json` 是私有最新收据。两套 SQLite 快照不是跨服务原子事务，但 grant 与写入意图相互独立；AFFiNE 文档本身以原应用数据库为准。

恢复时先在隔离目录解密、核对摘要与数据库，再停止**新**桥接 / 网关，保留现有私有目录副本，恢复 `private/`、`deployment/` 和 `state/`。将 `writes.sqlite3` 放入 bridge 状态目录，`oauth.sqlite3` 放入 gateway 状态目录；恢复正确文件权限，确认两个镜像可用，再启动新栈，复测匿名拒绝、已连接客户端读取与同键重试。不要把 `-wal` / `-shm` 与另一时点主库混用；先停止新容器再恢复在线快照主文件。恢复旧 OAuth 快照可能恢复曾撤销的授权，灾难恢复后应撤销现有客户端授权并重新连接。

这套备份只保护 MCP 的授权、重试与运行配置；AFFiNE 数据库和附件仍由原保护链恢复。已验证在线快照、异地 / 云端往返和隔离解密完整性；不把它等同整机丢失后的全栈重建演练、跨版本升级或跨服务一致时间点恢复。

## 客户端连接及常见故障

ChatGPT：Personal Plugins → **AFFiNE Read Write** → Try in chat。Notion：Settings → Connections → Developer connections，URL 填固定 MCP 地址，OAuth，允许 `affine:read affine:write`。正常 Notion AI Chat 已能使用该连接；无需把 AFFiNE 复制成 Notion 页面。

浏览器授权先登录 AFFiNE 所有者。若授权页提示失效，回客户端重新连接；不要复用过期回调地址。Edge 顶层表单提交失败已通过带 nonce 的同源提交规避，不关闭浏览器安全保护。Notion OAuth 弹窗输入无响应时，可在同浏览器普通标签页打开它正在显示的授权地址完成同一请求，然后刷新 Notion。读取显示空对象时确认网关输出同时包含 MCP 文本与 `structuredContent`。旧 `revision` 拒绝后重新读取并使用新幂等键；不确定写入结果则保持原键与原参数重试。

`revision` 是完整 CRDT 的不透明标记，网页补充块创建 / 修改元数据也会改变它，即使 Markdown 文本相同。写入返回值是该次确认时的状态；需要继续编辑时重新读取，不把之前写入返回值当作永久有效版本。最终镜像双端追加与刷新通过，后续各两次连续读取版本一致。
