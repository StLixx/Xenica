# XMind 独立入口

范围见 specs/83-xmind/spec.md，决策见 ADR 0021。原生画布来自当前 Web 发布资源；宿主菜单、鉴权与保存是本仓库实现。官方云账户、AI、协作分享、演说和甘特图不接入，也没有修改其账号、付费或加密校验。

## 运行与身份
Infra /var/lib/xmind/app 保存部署源码，xmind.service 以专用 xmind 用户运行，100.100.1.202:3055 仅作为反代上游。xmind.truebigsand.top 的专属 HTTPS 站点为 29，证书 SAN 覆盖该域名。edge.py 默认只读检查，显式 --apply 才创建，拒绝覆盖已有异指向。

已有 test 凭据经固定画板的登录接口验证，宿主不保存密码；自己的会话只存 SHA-256，Cookie 为 Secure/HttpOnly/SameSite=Strict。原生资源及文档 API 需要登录，写请求校验 Origin；每图按原有 test 用户 ID 隔离。Agent 使用既有机制签发的两小时测试身份，未重设密码。真实口令成功登录不冒充已实测；现有上游接口结构、拒绝路径及转发契约分别核验。

私有文档为 /mnt/HDD/xenica-private/xmind/workspace.sqlite，systemd 把该目录绑定到服务内的 /var/lib/xmind/state，其他私有资料目录保持不可访问。每次保存用 If-Match 和 SQLite 事务新增历史版本。409 停止自动写入，用户可导出自己的修改后重读服务器；历史版本恢复为新图，不覆盖最新内容。浏览器草稿尽力保存在本地，有配额限制；网络失败时应保持页面或导出。

## 原生资源与 REA
REA (Infra) 6.5.0 已作为本地 Codex 插件安装启用，经 SSH 调用 /opt/rea/bin/rea --mcp。官方 rea-agents 包从 npm 官方 registry 安装，隔离 Node 24.22.0 校验官方 SHA256，不升级系统 Node。插件真实握手返回 207 工具；当前会话通过相同运行时完成分析。

REA 对四个调用边界模块做有界静态分析，完整证据 /var/lib/rea-ops/xmind-native-contract-evidence.json，公开摘要见 evidence/rea-ledger.json。4/1115 源文件被选入，未选及超预算关系仍未知，静态调用不冒充运行证据。运行行为另以浏览器、实际数据库和导入导出验证。

发布标识 027432fb61aa24794c6f6dc2b0cb38edf22530db，Snowmonster 1.2.0-flatwhite.202609170020。freeze_assets.py 从 Infra 已采集目录计算闭包，拒绝 Git 目录、缺失依赖、越界和已有目标；不联网下载，也不修改第三方脚本。私有冻结目录 /var/lib/xmind/native-20261017-v2，490 文件 / 21,043,991 字节，清单见 evidence/native-assets.json。公开 Git 只有自有宿主、适配、来源哈希和截图证据；第三方原件在私有备份中恢复。

## 备份与重建
xmind-backup.timer 每日 UTC 03:30 加随机延迟，运行 backup_job.py。归档在 /mnt/HDD/xenica-private/xmind-backups，以新文件保留，不覆盖旧归档。backup.py create 使用 SQLite 在线备份，包含 state、native、web 和每文件 SHA256；restore 只允许全新目录，验证清单、数据库 integrity/FK/版本一致性并撤销旧会话和票据。

恢复：先在全新目录执行 backup.py restore --archive 私有归档 --destination 全新私有目录，检查回执；从 Git 取对应宿主 server.py/backup.py 和 systemd 单元，把恢复的 state/native/web 接到 service.env 对应位置。服务启动后核对 HTTPS、身份、文档与图片，再切换正式状态目录。不得直接覆盖正在运行的数据库。当前备份为同机私有磁盘归档，不声称异机灾备。

## 验证
Infra：python3 -m unittest discover -s deploy/xmind -p 'test_*.py'，以及 Node 语法检查。真实交互与图片往返、对照截图和部署身份在 specs/83-xmind/evidence；自检清单见同目录 design-qa.md。最终交互体验仍由用户亲自验收，验收前不合并。
