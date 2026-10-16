# AFFiNE

入口 https://affine.truebigsand.top，运行及依赖见 [运维记录](../../docs/context/affine-operations.md)。部署执行和测试只在 Infra；下面命令需要已有私有配置，不能把示例当生产密码。

## 文件与身份

- `/opt/stacks/affine/{compose.yaml,.env}`：固定镜像摘要与实例定义。
- `/etc/affine-ops/{server.env,database.json,bootstrap.json,config/}`：数据库、账号、私钥；0700/0600，不入 Git。
- `/mnt/HDD/affine/{storage,redis,backups,runtime}`：持久文件、缓存、备份、PG 运行镜像归档。
- `/opt/affine-ops`：本目录 Python 脚本；`/var/lib/affine-ops`：私有状态/证据/演练材料。
- 共享 PG：`1Panel-postgresql-euiI`，5432，panel-main，系统 ID `7689904531301453863`；源定义 `/etc/pg-ops/config.json`。

## 部署与重启

复制示例到上述私有目录，生成独立密码。PG 管理员先创建 affine 库、受限 affine_app、vector 扩展，再用现有 `deploy/pg-ops/permissions.py` 和 `access.py` 纳入数据库权限白名单；不要直接用管理员 URI 运行服务。服务池 5、角色连接上限 20。

```sh
cd /opt/stacks/affine
docker compose config --quiet
docker compose run --rm affine-migration
docker compose up -d affine-server
curl --fail http://100.100.1.202:9018/health
```

首次初始化仅在建立公开 DNS 前执行 `/api/setup/create-admin-user`。之后初始化入口必须拒绝重入；`config.json` 关闭公开注册与 OAuth 注册，不配置 SMTP、AI 密钥或支付。首个账户信息只私下交给用户。改密码后应同步私有恢复验证凭据；不要把新密码写进报告。

边缘使用 `edge.py` 与既有 Penpot 的 1Panel/Cloudflare 私有访问工具：只操作独立 AFFiNE 站点；保留 Host/Upgrade、HTTP1.1、HTTPS、100 MB 请求体和 3600 秒 WebSocket 超时。DNS 遇到不匹配记录会停止，避免覆盖。脚本内 IPv4 仅作用于当前 Cloudflare 请求。`edge-original.json` 只首次保存，不覆盖。

## 可重建的 PG 镜像

固定 PostgreSQL 基础摘要在 Dockerfile；在 Infra 使用工作目录准备已核对的 pgvector 源码：

```sh
git clone --branch v0.8.7 --depth 1 https://github.com/pgvector/pgvector.git pgvector-source
test "$(git -C pgvector-source rev-parse HEAD)" = f37c13f68b57d2c3472b2214fbcff699d6d34876
docker build --network=host -f Dockerfile.pgvector -t xenica-postgres:18.6-pgvector0.8.7 .
```

构建上下文只含 Dockerfile 和固定源；不在仓库提交第三方源码。`OPTFLAGS=''` 避免宿主 CPU 特有指令，`with_llvm=no` 保留基础镜像编译工具链兼容性。USTC 只用于构建器 APK，未改宿主镜像源。首次执行 `verify_pg_image.py` 对备份隔离验证，再以 `update_pg.py` 进行一次性带回退的原地镜像更新；两者不是日常重跑入口。更新后必须同时维护 PG ops 中的 `image`/`image_id`，否则权限/恢复工具可能选错镜像。

## 备份、监控与演练

```sh
python3 -S /opt/affine-ops/backup.py
python3 -S /opt/affine-ops/restore.py
python3 -S /opt/affine-ops/archive_image.py
python3 -S /opt/affine-ops/verify_access.py
python3 -S /opt/affine-ops/verify_compatibility.py
python3 -S /opt/affine-ops/verify_pg_recovery.py
python3 -S /opt/affine-ops/health.py
journalctl -u affine-monitor.service
systemctl list-timers affine-backup.timer affine-monitor.timer
```

备份暂停应用写入，保存 pg_dump、文档二进制指纹、附件 SHA-256、配置/私钥和镜像身份，finally 恢复应用运行。AES256 加密沿用现有私有密钥，传至 core，再同步既有 OneDrive `PG-operations-v1/affine-assets`。仅云端确认后保留七个完整集合。Redis 可重建，不作唯一数据源；数据库另受现有全量/WAL/PITR 保护。文件只有每日一致备份，不能宣称任意时刻跨库/文件 PITR。

每日 03:20（Asia/Shanghai）备份，每分钟监控状态变化写 journal；HTTP 9018 仅绑定 Tailscale，不含账号数据。检查实际业务角色/数据库、主库身份、扩展、应用查询、容器、25 小时备份新鲜度和 HDD 10 GiB 余量。没有新建邮件或聊天通知通道。

`restore.py` 从实际云端重新下载密文，校验摘要，在 `--internal` 临时网络启动 PG/Redis/AFFiNE，按业务角色恢复并验证行数、文档字节、附件、向量运算、原账号和工作区，finally 清理容器/网络。pgvector 由管理员安装，TOC 排除扩展及其注释，业务角色不获得超级权限。无业务公开端口、SMTP 或 AI 出网。临时演练材料保存在私有目录供排错，可在核对后定期清理。

`archive_image.py` 核对 OCI 索引身份（错误旧包会拒绝复用），保存并加密确切 PG 镜像，云端重新下载并核对压缩包 SHA-256。恢复新主机时从该密文解密后 `gzip -dc … | docker load`，核对 `images.json` 的 PG_IMAGE；AFFiNE 使用官方固定摘要，国内镜像站只作为同摘要传输路径。密钥须按现有私有应急规则另行保管，不能只留在丢失的主机。整机丢失与跨版本恢复本次未演练。

## 回退边界

PG 更新前的原 compose/配置在 `/var/lib/affine-ops/pre-pg-upgrade/`。自动更新失败会恢复当时旧配置；上线后不能整体覆盖旧 PG ops 配置，否则会丢掉 AFFiNE 的新权限映射。先停 AFFiNE、备份当前配置，比较后只调整明确的镜像项，并保留当前数据卷。已有 vector 对象的数据库依赖扩展二进制，旧裸 PG 镜像不能作为 AFFiNE 的可用回退；优先使用已验证镜像或从一致备份隔离恢复。所有回退保留新旧数据和原始证据。
