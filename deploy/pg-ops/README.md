# PG 运维

长期接管、设备与运行快照、历史优化和跨机迁移步骤见 [PostgreSQL接续](../../docs/context/pg-operations.md)。当前分别登记 Infra 的 `njupt-v2`（5434，有 core 备库）、`panel-main`（5432，含 Penpot，无热备）和 core 的两个 Xenica 主库；不合并同名业务库。

运行时配置与密钥放 `/etc/pg-ops/`（仅 root 可读），代码放 `/opt/pg-ops/source/`。
`pg_ops.py` 支持 backup、encrypt、cloud、monitor、prune、restore-drill；配置示例不含秘密。

`access.py --source <源名>` 只对配置中 `database_roles` 登记的非超级业务角色安装数据库白名单，保存原认证文件并检查解析结果后重载；其他角色规则保持原样。Penpot角色仅允许连接penpot库，不能用“非超级用户”代替实际跨库拒绝验证。认证规则改变后重新备份并用 `drill.py --source <源名>` 验证该源云端恢复。

基础备份使用集群同版本 `pg_basebackup`，WAL 归档原子落盘并验证重复内容。配置与新清单绑定 PostgreSQL 系统 ID；重建集群使用独立名称及 `backup_subdir`，不能继承旧 WAL 或成功回执。清单含 SHA256、镜像摘要、起始 WAL 与数据库列表。保留七份每日完整备份及相应 WAL；清理前确认独立副本。未绑定身份的历史副本与 WAL 保留原样，不补造身份、重新发布或自动清理。

恢复只允许新目录，在 Infra 的隔离容器校验官方 manifest、恢复数据库列表与指定恢复点。生产目录不允许覆盖；容器没有网络出口。恢复后先核验应用权限与配置，再执行受控切换。

密文副本使用 GPG AES256，密钥另存于两机私有目录，不能把密钥放进云端归档或 Git。备份密文位于已有 OneDrive 的独立任务目录，不涉及其他文件。

手动切换仅针对已登记的 njupt 主备：旧主运行 `failover.py fence --source <当前主源名>`，把私有回执交给备机；备机运行 `failover.py promote --source <当前备源名> --receipt <回执路径> --old-primary <旧主IP>`。提升复核登记系统 ID、旧主关闭且禁用自动启动，并等待最终停止检查点重放。不可验证的隔离证据必须停在人工处理阶段。

提升后在新主执行 `maintenance.py set-role --source <源名>` 登记角色，完成新主首份备份；在 Infra 执行 `maintenance.py switch-apps --source <njupt源名> --host <新主IP>`。该操作只修改明确登记的 njupt 应用配置，不切换 Penpot。旧主保持停止，执行 `maintenance.py rejoin --source <旧主源名> --host <新主IP>`；端口和复制凭据字段来自实测配置，不回退旧 5433。通过身份检查后才保留旧目录并换入新备库，再登记角色。本次没有执行生产提升或重建；保留的旧目录由管理员另行处理。

升级先记录镜像摘要、配置和完成的备份，使用 `drill.py` 校验目标版本的恢复；生产逐实例维护。小版本失败可恢复原摘要与配置；大版本必须恢复匹配版本的完整备份，不能用旧二进制直接打开升级后的数据目录。

Infra 构建、编译、测试使用 `infra-dev-run <命令>`，共用开发 slice 的 4 CPU/6 GiB 上限；Docker 容器另设内存与 CPU 限额，不能假设客户端 scope 会限制 Docker daemon 启动的容器。生产 PG 有独立容器预算。
