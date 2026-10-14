# PG 运维

运行时配置与密钥放 `/etc/pg-ops/`（仅 root 可读），代码放 `/opt/pg-ops/source/`。
`pg_ops.py` 支持 backup、encrypt、cloud、monitor、prune、restore-drill；配置示例不含秘密。

基础备份使用集群同版本 `pg_basebackup`，WAL 归档原子落盘并验证重复内容。基础备份完成清单含 SHA256、镜像摘要、起始 WAL 与数据库列表。保留七份每日完整备份及相应 WAL；清理前必须确认独立副本已成功。

恢复只允许新目录，在 Infra 的隔离容器校验官方 manifest、恢复数据库列表与指定恢复点。生产目录不允许覆盖；容器没有网络出口。恢复后先核验应用权限与配置，再执行受控切换。

密文副本使用 GPG AES256，密钥另存于两机私有目录，不能把密钥放进云端归档或 Git。备份密文位于已有 OneDrive 的独立任务目录，不涉及其他文件。

手动切换顺序：旧主运行 `failover.py fence --source shared`，把输出的私有回执交给备机；备机运行 `failover.py promote --source shared-standby --receipt <回执路径> --old-primary <旧主IP>`。提升会复核旧主关闭且禁用自动启动，并等待最终停止检查点重放。原始端口超时不能代替隔离证据；不可验证的旧主必须停在人工处理阶段。

提升后在新主执行 `maintenance.py set-role` 登记备份与归档，再在 Infra 执行 `maintenance.py switch-apps --host <新主IP>`。旧主保持停止，执行 `maintenance.py rejoin --host <新主IP>`，通过身份检查后才保留旧目录并换入新备库，最后执行 `maintenance.py set-role`。回切用同一顺序反向执行；复制协调器按实际主库角色选择方向。保留的旧目录由管理员在确认恢复后另行处理，脚本不删除。

升级先记录镜像摘要、配置和完成的备份，使用 `drill.py` 校验目标版本的恢复；生产逐实例维护。小版本失败可恢复原摘要与配置；大版本必须恢复匹配版本的完整备份，不能用旧二进制直接打开升级后的数据目录。
