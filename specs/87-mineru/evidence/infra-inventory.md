# Infra 只读现状与复用入口

核查日期：2026-10-17（Asia/Shanghai）。所有命令通过 Windows 轻量入口 `Invoke-Xenica.ps1` 在 `infra-server` 执行；本次未改变数据库、容器、服务、DNS、证书或配置。下表是当前现场证据，不能由旧文档替代；不包含凭据。

## 主机与开发资源

- 主机返回 `infra-server`；远端 `git@github.com:StLixx/Xenica.git`；主线核查提交 `098053ec1eb12bfac6fec835f2cd19d510159579`，工作树无显示修改。
- MinerU 工作树已存在于 `/opt/xenica-workspace/worktrees/87-mineru`。本文件为该任务唯一写入。
- `/usr/local/bin/rustc` 与 `cargo` 均为 1.99.0；Docker、Node、pnpm 已存在。`/root/.cargo` 约 441 MiB。main 与 XMind 工作树没有 target 目录，未发现可直接复用的目标缓存。
- 构建入口 `/usr/local/bin/infra-dev-run`，包装 `systemd-run --scope --slice=pgops-development.slice`；现有 slice 为 4 CPU、MemoryHigh 4 GiB、MemoryMax 6 GiB、IOWeight 25。
- 核查时 RAM 15 GiB，available 9.7 GiB；根卷可用约 15 GiB，HDD `/mnt/HDD` 可用 2.4 TiB。大型附件与可重建编译产物优先放 HDD 的任务独立目录，避免占满根卷。

## PostgreSQL：现场 SQL 证据

通过 `/etc/pg-ops/config.json` 选定容器及管理员，容器内只执行 SELECT version()、pg_control_system()、pg_is_in_recovery() 与库清单。

| 源 | 容器 | 端口 | 版本 | 系统 ID | 恢复角色 |
|---|---|---|---|---|---|
| panel-main | 1Panel-postgresql-euiI | 100.100.1.202:5432 | PostgreSQL 18.6 | 7689904531301453863 | pg_is_in_recovery=false |
| njupt-v2 | njupt_db | 100.100.1.202:5434 | PostgreSQL 18.6 | 7696289758828699687 | pg_is_in_recovery=false |

panel-main 现有业务包括 penpot、affine；njupt-v2 有 njupt_notice、njupt_console。MinerU 库尚不存在。本轮部署建议选 panel-main 新建独立 `mineru` 库，避免改动 njupt 业务。已有 `xenica-dev-pg` 容器绑定 127.0.0.1:15432，未核实其实际管理员、系统 ID 与库，不将其当正式目标。

panel-main 当前配置已绑定 `system_id=7689904531301453863`，固定镜像 ID `sha256:f2017424de7f9f527b5e0751e611d6ef03d58caf55d9974a9df6bde152a059c0`，备份目录项 `pgops`，权限白名单现有 penpot_app→penpot、affine_app→affine。

### 受限角色操作入口（尚未执行）

- `/opt/pg-ops/source/permissions.py --source panel-main --database mineru --app mineru_app --limit 20`：前置需管理员创建空库；脚本建立 NOLOGIN `mineru_app_owner` 与受限 `mineru_app`、连接上限、库/模式所有权，凭据写 `/etc/pg-ops/roles.json`，并实际验证业务账号 DDL。
- 必须在私有 `/etc/pg-ops/config.json` 的 panel-main `database_roles` 中合并新增 `mineru_app: [mineru]`，保留已有映射；随后 `/opt/pg-ops/source/access.py --source panel-main` 安装仅该库的 HBA 白名单并解析检查、reload。应用只使用业务 URI，不用管理员 URI。
- 部署后要实测业务账号能连自身库、读写迁移，并拒绝连接 postgres/penpot/affine 等其他库；SQLx pool 建议 5、角色上限 20，与既有轻型业务一致。上述数值是设计建议，尚未执行或验收。
- 现有库 HBA 路径由工具验证为 `/var/lib/postgresql/18/docker/pg_hba.conf`，宿主数据根 `/opt/1panel/apps/postgresql/postgresql/data`。

### 备份现状与界限

- 现场 `/var/lib/pg-ops/monitor.json` 的 `ok=true`、alerts=[]；njupt-v2 与 panel-main 均 archive_mode=on、archive_failed=0，备份年龄约 60,400 秒。
- njupt-v2 replication=streaming、lag_bytes=0；panel-main replication=[]。panel-main 无热备，不能声称自动故障转移。
- `pgops-backup.timer`、`pgops-replicate.timer` 当前 active。新增库会进入集群物理备份，但附件不在 PostgreSQL 内，必须另做一致备份与恢复验证。
- 可参考 deploy/affine/{backup.py,restore.py,archive_image.py} 与 `/opt/affine-ops` 的私有配置/状态/加密云端恢复设计；不要直接复用它们的 affine 固定库名或暂停范围。

## HTTPS、域名和服务

- 既有 1Panel 私有调用 helper：`/var/lib/penpot-ops/access.py`，提供 panel/cf；凭据不应复制到仓库。
- 1Panel `/websites/search` 当前存在 Penpot 站点 27、XMind 站点 29，均 HTTPS 代理；未发现 mineru.truebigsand.top。
- 模板 27 关联证书 PEM 在内存交给 openssl，SAN=`*.truebigsand.top`，notAfter=`2026-11-22 15:13:33 GMT`；`-checkhost mineru.truebigsand.top -checkend 604800` 返回 0，当前覆盖有效。
- 系统解析 mineru.truebigsand.top 返回 gaierror；随后通过 Cloudflare 只读 API 核实 truebigsand.top 区域恰有一个、mineru 精确名称记录数为 0。先前复用 XMind 脚本强制 IPv4 时两轮失败 URLError；去掉 IPv4 monkeypatch 后 API 查询成功。因此不要照抄旧 IPv4 强制逻辑，按实际网络验证。
- Infra `ss -lnt` 现场显示 3056、3057、8088 均空闲。建议独立 Rust 服务绑定 `100.100.1.202:3056`（需要测试时兼容 localhost），由 hikari 1Panel 代理 HTTPS。该端口仅建议，尚未占用。
- 最适合复用的严格边缘流程：`/opt/xenica-workspace/worktrees/83-xmind/deploy/xmind/edge.py`，先只读 plan、检查所有站点主/次域名、验证证书、拒绝覆盖不匹配 DNS/上游、保留原配置，再 apply。需把 DOMAIN、alias、注释标记、upstream、STATE 一并 MinerU 化；仅改 DOMAIN 会因 xmind alias 冲突失败，不能直接运行旧脚本。
- 上传大小和长请求超时应按本次 MinerU API 事实定界，不照搬 XMind 33 MiB 或 AFFiNE 100 MiB。
- 服务沙箱可参考 #83 的 xmind.service：独立 Linux 用户、EnvironmentFile、UMask=0077、NoNewPrivileges、ProtectSystem=strict、ProtectHome、PrivateTmp、限定 ReadWritePaths、内存与任务上限；运行目录可设 /var/lib/mineru/app，私密附件 /mnt/HDD/xenica-private/mineru，配置 /etc/mineru-ops，状态 /var/lib/mineru-ops。这些为待实现方案。

## 鉴权复用

#83 `deploy/xmind/server.py` login() 使用后端请求 `http://100.100.1.103:8080/api/auth/login` 并设置 Host=`excalidraw.xenica.truebigsand.top`，只接受现有 test 身份；成功后创建服务自己的随机会话并以 SHA256 存储，Cookie Secure/HttpOnly/SameSite=Strict。MinerU 的 Rust 后端可复用该认证机制，改用独立 __Host-mineru Cookie 和 PostgreSQL session 表；不能跨域直接复用 XMind Cookie。静态资源、PDF、切图、JSON 和下载均应鉴权，错误日志不输出 token 或签名 URL。当前仅核对已部署方案的代码与 xmind.service active，尚未实际登录 MinerU。

## 未决与下一步

1. Cloudflare API 已在默认网络模式下成功只读核查，mineru 精确 DNS 记录数为 0；部署应沿用当前可用网络，不加旧脚本强制 IPv4。
2. Rust 具体依赖版本、PDF 前端渲染方案与免费 API 的端点、凭据、配额均由逆向主线确认，不由 Infra 库存推断。
3. 正式库/角色尚未创建；备份与跨库拒绝、附件恢复、服务资源上限和公开匿名拒绝均需实施后实际验证。
4. 本记录描述当前现场，不意味着用户已体验验收。
