# PG 运维

运行时配置与密钥放 `/etc/pg-ops/`（仅 root 可读），代码放 `/opt/pg-ops/source/`。
`pg_ops.py` 支持 backup、encrypt、cloud、monitor、prune、restore-drill；配置示例不含秘密。

基础备份使用集群同版本 `pg_basebackup`，WAL 归档原子落盘并验证重复内容。基础备份完成清单含 SHA256、镜像摘要、起始 WAL 与数据库列表。保留七份每日完整备份及相应 WAL；清理前必须确认独立副本已成功。

恢复只允许新目录，在 Infra 的隔离容器校验官方 manifest、恢复数据库列表与指定恢复点。生产目录不允许覆盖；容器没有网络出口。恢复后先核验应用权限与配置，再执行受控切换。

密文副本使用 GPG AES256，密钥另存于两机私有目录，不能把密钥放进云端归档或 Git。备份密文位于已有 OneDrive 的独立任务目录，不涉及其他文件。
