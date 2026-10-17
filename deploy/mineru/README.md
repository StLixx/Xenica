# MinerU 运维与恢复

仅在 infra-server 执行。对外 https://mineru.truebigsand.top，Rust 监听 100.100.1.202:3056。既有 panel-main PostgreSQL 18.6 是唯一业务数据库，系统 ID 7689904531301453863；独立库 mineru、受限 mineru_app 和 NOLOGIN 拥有者 mineru_app_owner。不能使用管理员 URI 运行应用。

## 私有目录和环境

- /etc/mineru-ops/service.env：0600 root，仅服务管理器读取；含 DATABASE_URL、MINERU_PROVIDER_BASE、MINERU_API_BEARER、MINERU_DESKTOP_TOKEN、MINERU_DESKTOP_VERSION、MINERU_PUBLIC_URL。
- MINERU_BIND=100.100.1.202:3056，MINERU_WEB_ROOT=/var/lib/mineru/app/web，MINERU_DATA_ROOT=/var/lib/mineru/state。
- 文件真实位置 /mnt/HDD/xenica-private/mineru，归 mineru 用户；全局 xenica-private 父目录仍 0700 root。systemd 把该业务子目录绑定到 /var/lib/mineru/state，不能为访问业务数据放宽全局父目录。
- /var/lib/mineru/app：可切换的应用根，包含 mineru-server 与 web/；/var/lib/mineru-ops 是私有运维报告，/opt/mineru-ops 保存本目录运维脚本。
- 所有文件接口都经过独立 __Host-mineru 会话。边缘不直接暴露 HDD、ZIP 或 provider token。仅 /api/health、/healthz 是匿名健康入口。

## 发布与回退

在任务工作树构建和自检；把已核对 SHA256 的服务器二进制和 web 复制到新的 /var/lib/mineru/releases/<提交> 临时目录，再重命名为不可变版本目录。初次部署将 app 创建为指向该目录的符号链接；已有 app 如果是普通目录，先完整保存并明确迁移，不能覆盖删除。以后先记住原 app 链接，再用同目录临时链接 + 原子 replace 更新 app，重启 mineru.service。整个 app 根一起切换，避免二进制与前端身份不一致。

部署前完成一次已确认的私有备份；后端 /api/health 通过后才 apply 边缘。重启后核对服务实际用户、监听地址、健康、已鉴权文件读取与匿名拒绝。失败立即把 app 链接原子切回原版本并重启，保存失败报告；数据库变更只向前添加迁移，不自动猜测执行破坏性降级。备份包含运行中的明确应用版本，可用于恢复。

安装 mineru.service、mineru-backup.service、mineru-backup.timer 到 /etc/systemd/system，运维脚本到 /opt/mineru-ops；daemon-reload 后启动并启用服务。必须先创建独立 Linux mineru 用户、业务目录所有权和绑定挂载点。单位验证仅在目标可执行文件已安装后才会通过。

## HTTPS 边缘

edge.py 默认只读，也可显式 --plan；--apply 仅创建已验证的专用站点和精确 DNS。脚本遍历现有主/次域名，拒绝 alias 冲突、非预期上游、异样 DNS、证书覆盖/期限不足。复用当前 Penpot HTTPS 模板证书，不复制其业务配置。只修改专用站点服务器层指令，205 MiB 请求上限、300 秒代理超时；保存原配置到 /var/lib/mineru-ops/edge-original-<id>.json，再核对落盘配置。DNS 仅在专用 HTTPS 配置成功后创建；没有强制 IPv4 网络补丁。

2026-10-17 真实 --plan 返回 applied=false、website_action=create、dns_action=create。该事实不是上线证据；实际 apply 和 HTTPS 验证由部署记录另记。apply 之后重跑 plan 应 reuse。回退前保存现场；如需撤销仅删除本任务创建且身份完全匹配的站点和精确记录，不触碰复用证书或其他域名。

## 一致备份与隔离恢复

backup.py 默认执行备份，先核对配置及实时 PostgreSQL 系统 ID、非恢复角色，然后停止且仅停止 mineru.service。停止期间采集自有库 custom dump、自有两个角色（包括私有密码哈希）、逐表行数/有序行哈希、附件哈希、数据归档、环境/单位与明确应用根归档；finally 恢复原本 active 的服务。未启用的服务不会被备份误启动。备份耗时窗口内解析暂停，启动由持久任务恢复。

完成清单与 SHA256 验证后，文件逐一 AES256 加密，密钥沿用私有 /etc/pg-ops/backup.key；只把密文发到独立 core-server 的 /var/lib/pg-ops/encrypted/mineru-assets，再经既有 pg-ops cloud 流程同步专用云目录 PG-operations-v1/mineru-assets/base。云成功回执须包含最新集合，才允许保留最近七组并删除旧组。集群已有物理备份包含新库，但不能替代这份数据库/附件一致备份。密钥需另外按既有私有流程保全，公开仓库没有密钥与解密材料。

- 本地明文：/mnt/HDD/xenica-private/mineru/backups/<UTC时间>。
- Infra 密文：/mnt/HDD/pg-ops/encrypted/mineru-assets/base/<UTC时间>。
- 结果：/var/lib/mineru-ops/backup.json；失败只报告异常类别，原始 stderr 保存在私有 last-error.log。
- backup.py --verify <已解密集合>：验证所有清单 SHA256，不改数据库。
- backup.py --restore-check <已解密集合>：在当前已核对集群新建随机 mineru_restore_* 临时库，用 mineru_app_owner 恢复；比较全部表行数/行哈希，安全解包附件到私有 drills，逐文件比较。finally 删除临时库，不覆盖正式表或正式附件。

恢复演练必须先从云端下载指定已确认密文集合到新的私有 drills 子目录，用既有密钥解密，验证 complete.json 的文件名与 SHA256，再运行 --restore-check；不能用本地明文冒充云恢复。脚本的隔离恢复只证明同版本集群的数据与附件一致，不等于整机故障转移、新机角色/HBA 重建、跨版本兼容或前端实际登录已验证。新机恢复需显式使用私有 roles.sql 创建两角色，创建 mineru 库、恢复 dump，按 pg-ops 流程恢复仅该库 HBA 权限，再还原附件/应用/环境、安装单位、健康与登录验证后才切边缘。不得把完整其他业务库或全局角色导出来替代自有范围。

timer 设为每天 Asia/Shanghai 03:45，允许 120 秒随机错峰和 Persistent 补跑。第一次备份、云端回取、隔离恢复、重启和权限拒绝都需记录实测结果后才声称通过。

2026-10-17 已从实际云端重新下载最终集合 20261017T115359Z 的 6 份密文、解密并核对组件摘要，在随机隔离库恢复 4 张表并比较行数/行哈希，核对 24 份附件；归档 66 个应用文件与当前部署一致。证据见 [application-recovery.json](../../specs/87-mineru/evidence/application-recovery.json)，未覆盖正式库或附件。备份 timer 已启用；本次仍未演练整机丢失、角色重建或跨版本恢复。研究原件另存独立加密 namespace，其完整云回取因低速尚未完成，边界见 [research-freeze.json](../../specs/87-mineru/evidence/research-freeze.json)。

## Provider 凭据和运行边界

优先使用已验证 Desktop 应用 Bearer + 既有设备 token。两者均只在服务端环境；不是用户个人管理页 Token 的同义值。本轮不部署识别模型。参数与额度边界及其证据见 ../../specs/87-mineru/protocol.md。

上游 401 或 -60012 时保留原件与任务，管理员只读取 Desktop config 的 client_api_token 和包内应用 Bearer，私下更新环境并重启；用自制公开 PDF 走完整链路再恢复队列。固定 JWT 的自报过期值不能当服务长期可用保证；个人 API 作为备选必须重新验证接口字段和额度。日志不能记录请求认证头、完整签名 URL、原书内容或 DATABASE_URL。更换环境后下一份加密备份才包含新凭据。

## 实际产物核对

`python3 deploy/mineru/verify_deployment.py --output specs/87-mineru/evidence/deployment.json` 核对本工作树构建目录、运行文件、HTTPS原始响应、systemd单元、健康及八类匿名拒绝。原文/图片/导出同样鉴权。当前产物身份和用户验收状态以部署证据为准；源代码更新后必须重新构建、原子切换并重测，不能只改报告。

root的旧画板端到端检查与MinerU独立应用检查分开记录，参见 repository-checks.json。独立应用的 Rust/真实API/浏览器场景与实际恢复证据均在 specs/87-mineru/evidence/。
