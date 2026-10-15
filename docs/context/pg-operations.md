# PostgreSQL 运维与迁移接续

本补充任务 #67 归入 #54 的 v0.2.5 开发脚手架目标；原实施任务 #63、合并记录 #64 已有运维源码和恢复证据。本页补齐接管入口，不移动已发布 Tag，不把后补资料当成旧发布源码。

原始依据：[规格](../../specs/63-pg-operations/spec.md)、[运维决策](../adr/0016-pg-operations.md)、[源码](../../deploy/pg-ops/README.md)、[2026-10-14 验证快照](../../deploy/pg-ops/evidence.json)。Penpot 后续上线与端口故障另见 [Penpot 接续](penpot-operations.md)。

## 先读：2026-10-15 缺陷69修复后

当前实测与云端恢复记录见 [修复证据](../../deploy/pg-ops/recovery-69-evidence.json)、[范围](../../specs/69-pg-source-recovery/spec.md) 和 [维护入口](../../deploy/pg-ops/README.md)。保留双集群：Infra `njupt-v2` / 5434 向 core 备库复制，`panel-main` / 5432 承载 Penpot 等业务；core 两个 Xenica 主库保持独立，没有合库或生产提升。

四个主库均绑定系统 ID、完成新基础/逻辑备份与持续 WAL、跨机加密及云端确认；两机8097恢复健康。1Panel归档已启用，Penpot角色为非超级用户且连接上限恢复12。补查发现该角色仍可连接其他库，已安装仅针对它的数据库白名单：生产及云端恢复副本均验证penpot允许、其他8库拒绝，其他角色认证规则保留。njupt应用实连5434，Penpot实连5432，主备维护工具不再联动Penpot，也不回退旧5433。回退副本在两机 `/var/lib/pg-ops/recovery-69/`，认证文件回退另存 `access-rollback/`，凭据仍在原私有配置。

当前四源从OneDrive实际下载后，全量与指定恢复点共8次通过，409.49秒；独立副本延迟样本67.84–68.71秒。权限补修后5432重新备份并从云端复验2次，149.76秒；恢复的认证文件与生产一致，原业务密码的正反连接验证通过。Penpot数据库、15个素材、原账号登录及设计读取配套恢复通过，31.74秒。样本不是SLA；5432无热备，生产主备切换、整机丢失和跨版本恢复未在本次执行。旧shared目录及未绑定身份的历史副本保留，不补造身份或自动清理。

### 修复前的只读快照（历史）

本日最初只读核验见 [配置与运行清单](pg-inventory-2026-10-15.json)，当时两机旧配置仍指向不存在的 `njupt-pg`，8097监控均失败，因此登记 [缺陷69](https://github.com/StLixx/Xenica/issues/69)。下表和旧快照保留故障发生时的事实，不代表上方修复后的当前状态。

| 当前集群 | 数据 / 宿主入口 | 已核验及限制 |
| --- | --- | --- |
| Infra `1Panel-postgresql-euiI` | `/opt/1panel/apps/postgresql/postgresql/data`；5432映射所有IPv4/IPv6接口 | PG18.6主库，含Penpot及多个业务库；archive_mode=off。端口映射不等于已证实公网可达，本次不改防火墙。 |
| Infra `njupt_db` | `/opt/stacks/njupt-pg/data`；Tailscale及本地5434 | PG18.6主库，njupt两个业务库；归档on、60秒、槽上限2GB。旧备份脚本仍查旧容器。 |
| core `njupt_db` | 同路径；Tailscale及本地5434 | PG18.6备库，recovery=true；未重新验证应用路由、新拓扑复制延迟和恢复。 |
| core `xenica-db-1` / `xenica-sketch-db-1` | 各自Docker卷，容器内5432 | PG18.6独立主库，归档on；各512MiB/2CPU。未集中迁移。 |

设备/HDD/代理的历史核验见 [设备清单](penpot-inventory.json)，以其中日期为准。Infra开发库15432、预览临时库和Immich专用PG不属于原三生产源演练，不能共用其生命周期或替换专用扩展镜像。

## 优化任务做过什么

| 项目 | 2026-10-14 完成依据 | 修复前核验与限制（修复后见上方） |
| --- | --- | --- |
| scale、迁移与调参 | ADR0016；当时CPU、I/O和连接压力未支持立即迁移或激进调参 | 保持隔离、资源预算及按查询证据优化；无Supabase、无Xenica集中迁移。今天容器分流的操作者和意图未从本会话确定。 |
| 三生产源备份 | shared、xenica、xenica-sketch基础/逻辑备份、持续WAL、7份完整日备份 | 旧shared配置已失配，当前1Panel库不能套用旧结论。 |
| 独立副本 | AES256，两机和既有OneDrive；云端确认后才清理过期备份 | 复制任务success不能证明所有当前业务数据被覆盖。 |
| 恢复 | 云端实际下载、解密、摘要/官方manifest、全量及误写前PITR；整套1029.38秒 | 仅代表当时数据量与拓扑，新环境须重做。 |
| 切换与回切 | 隔离双节点旧主隔离、最终检查点、提升、保留旧数据、重建、回切；9.03秒 | 不等同于本次生产切换。旧主无法验证时拒绝提升，新端口/容器必须先适配。 |
| 最小权限和连接预算 | 专用非超级用户，跨库拒绝、迁移/读写验证；Penpot池2–10 | 当前重建是否完整保留角色授权尚未复测，实际角色资料在私有roles.json。 |
| 镜像、资源、监控 | 固定镜像摘要、实例限额、开发slice4CPU/6GiB、13项失败保护测试 | 当前inspect和源码摘要见快照，浮动18标签不能代替registry摘要；两机监控当前报警。 |

RPO≤5分钟/RTO≤1小时是原目标；25.87秒独立副本延迟及约17分钟恢复为历史样本，不是SLA。Penpot文件备份和PG WAL粒度不同。

## 权威源码及私有接管材料

| 位置 | 用途与边界 |
| --- | --- |
| `deploy/pg-ops/pg_ops.py`、`archive.sh` | 基础/逻辑备份、WAL原子归档、摘要、加密、云端、保留、监控与隔离恢复 |
| `replicate.py` | Infra协调跨机密文；core上传OneDrive并返回完成回执 |
| `drill.py` | 三源云端全量/PITR演练；会写验证标记、创建恢复点，不是只读巡检 |
| `failover.py`、`fence_status.py`、`maintenance.py` | 隔离旧主、提升、应用重连、保留旧数据及重建；生产写操作 |
| `failover_drill.py` / `penpot_drill.py` | 隔离切换与当时兼容性演练，不能替代新拓扑验收 |
| `permissions.py`、`test_pg_ops.py`、systemd文件 | 角色、失败保护与调度源码 |
| 两机 `/opt/pg-ops/source/` | 已部署源码；本日快照保留规范化LF的SHA256以便比较 |
| 两机 `/etc/pg-ops/{config.json,roles.json}` | 备份源/镜像/路径/云端及角色资料；shared容器配置当前过期 |
| `/etc/pg-ops/backup.key`、`fence-check-key*` | 解密与旧主验证材料；单独私有恢复，禁止进Git或和密文一起公开 |
| Infra `/etc/pg-ops/runtime-*.env`、业务私有.env | 应用登录与路由；模板不能代替实际凭据 |
| 两机 `/var/lib/pg-ops/` | 状态、cloud/replication回执、私有错误、恢复/隔离回执、live配置；复核源身份和时间 |
| Infra `/mnt/HDD/pg-ops/encrypted` / core `/var/lib/pg-ops/encrypted` | 密文副本；各源data_root下pgops/base与pgops/archive为基础备份和WAL |
| core `drive02:PG-operations-v1` | 原云端专用目录；认证在 `/root/.config/rclone/rclone.conf`，仅有别名不能恢复 |
| `/opt/stacks/njupt-pg/{compose.yaml,.env,repl.env,app.env}` | 原共享部署、复制与应用材料；现实际njupt_db5434，不能盲用旧命令 |
| core `/opt/xenica/deploy/{.env,compose.override.yaml}`、两个Docker卷 | 两个Xenica生产库实际部署和数据，仓库模板不是全部运行配置 |
| Infra `/opt/1panel/apps/postgresql/postgresql/docker-compose.yml` 和私有环境 | 当前5432集群额外接管依赖，原pg-ops示例不覆盖 |

新机核验Docker/Compose、同版本PG客户端镜像、Python3、GPG、rclone、rsync、SSH、systemd及持久挂载。脚本硬编码旧hostname/IP、PEER、PG18目录及部分5433目标；更换设备必须适配并验证，不能直接执行rejoin/switch-apps。

## 备份、监控和恢复入口

原调度：每日02:30 Asia/Shanghai备份，随机延迟≤120秒；复制/监控约每分钟；每日04:30清理。实际上次结果在快照，service成功或旧status成功不能消除当前监控报警。

先只读检查timer、两机8097接口、monitor.json、最新完整清单、云端回执和WAL连续性。health.py是HTTP常驻服务，不能直接启动它当巡检。

旧shared备份/恢复/切换命令仍不作为当前接管步骤。当前参数见README与脚本argparse，先审查cfg、系统ID、端口和目标目录，禁止覆盖生产数据。验证旧副本使用隔离、无公开端口/出口的新目录，并核对系统ID与时间线。

## 迁到另一台机器的顺序

1. 确认权威主库与每个应用URI，逐库列出owner、角色、扩展、编码/locale、版本、表空间和大小；查明今天分流的数据哪个被使用。保留旧机和副本。
2. 私下备齐解密、数据库/复制/应用凭据、SSH、rclone、固定镜像、卷及服务配置，记录缺失项。只有密文、Git和模板不足以恢复。
3. 新机预留容量/开发隔离、持久挂载，匹配PG大版本、扩展、locale和UID；记录不可变registry manifest，不依赖最新标签。
4. 取得覆盖全部当前业务库的一致备份，实际确认云端可下载。同版本物理恢复或逻辑迁移按业务选择；基础备份须配完整WAL。大版本/发行版/扩展/locale变化先隔离验证，不能直接复制目录。
5. 隔离恢复校验摘要/manifest、数据库/角色/授权/扩展、业务登录、迁移/写入和重启。Penpot另配assets、配置及稳定服务密钥。
6. 按另行审核的窗口隔离写入、补最终增量，防止双主；验证恢复点后更新Tailscale、防火墙、应用URI，必要时DNS/反代。端口连通不是业务验收。
7. 重接新机备份/WAL/云端/监控/复制，并实际恢复新副本，核验RPO/RTO。旧机与数据保留到确认；新机已有新写入时不能简单指回旧机造成数据丢失。

这是接管检查单，不是已验证的新机自动安装器。全机迁移、跨大版本恢复及新拓扑生产切换尚未执行。

## 记录方式与来源

用户本会话要求把PostgreSQL scale、迁移优化、部署和备份任务补充至v0.2.5、存GitHub供回顾迁移。原#63/#64及补充#67/#68关联父#54和v0.2.5 Milestone；不重开或改写旧Release。

2026-10-14依据在规格、ADR、原evidence和永久delivery-records；2026-10-15来自两机只读Docker inspect、psql、systemd、配置白名单及运行源码SHA256。快照不含完整.env、Docker环境变量、数据库内容或私钥。异常登记69，没有把“归档完成”写成“当前生产优化全部健康”。
