# Penpot 考证与记录入口

## 任务和范围来源

- 父目标：[#54 v0.2.5 持久开发画板与交付验收体系](https://github.com/StLixx/Xenica/issues/54)；子任务：[#65](https://github.com/StLixx/Xenica/issues/65)；实施与追加归档使用同一个 [PR66](https://github.com/StLixx/Xenica/pull/66)，Milestone 为 v0.2.5。
- 本会话标识：`01a13890-cbe2-7ff0-885e-75317a6424d0`。原聊天与附件含凭据，保留私有；仓库记录决定及非敏感摘要，不上传整段聊天。
- 原始部署范围、后续 MCP / 许可 / 网络 / 访问修复与归档范围在 [规格](../../specs/65-penpot-deployment/spec.md)。逐项来源为本会话用户的「开始」、功能选择、无限期密钥授权、实际故障反馈与最后的提交合并指令。
- 最后指令原话（记录原样，不用它伪造另一个消息 ID 或更早的体验时间）：

> 那把 Penpot 的全部长期信息包含你提到的部署配置、运维脚本，以及其他所有未来可能需要考证时用到的信息；还有这次是怎么记录的、设备是什么样的，都以 the nica 的标准形式提交，合并到 v0.2.5 版本下。也作为。 V0.2.5 开发起脚手架的搭建。目标下的任务

这是明确的归档与合并授权。内部验收记录保存此原话、会话来源、归档确认时间以及实际部署 / 候选身份；不冒充用户最初打开页面的精确时间，也不宣称用户体验了新的 Xenica 功能。

## 事实层级

| 层级 | 权威位置 |
| --- | --- |
| 用户决定与待验证事项 | `docs/context/index.json`、规格、ADR0017；原话来源见本页 |
| 可复现实施 | `deploy/penpot/`；共享 PG 实施及主备策略见 `deploy/pg-ops/`、ADR0016 |
| 当前设备与非敏感连接清单 | `penpot-inventory.json`，含核验日期；变动后重测，不能把快照当实时状态 |
| 初始部署历史 | `deploy/penpot/evidence.json`；原空实例阶段，不覆盖后来用户的设计状态 |
| MCP / 原生集成与素材验证历史 | `deploy/penpot/integrations-evidence.json`，含当时镜像 / 配置身份 |
| 访问故障修复基线 | `deploy/penpot/access-recovery-evidence.json`，业务主库 / 备库拒绝、profile200、23项运维检查、真实云端恢复 |
| 原始私有探针与恢复清单 | Infra `/var/lib/penpot-ops/`、配套备份 `complete.json`；原件 / 用户设计不公开 |
| 探针的非敏感源码 | `deploy/penpot/diagnostics/`；实际使用的协议与签名函数保留，认证输入仍在私有位置 |
| 永久工程与验收记录 | 本仓库 `delivery-records/index.json` 串联 `records/<sha256>.json`；实际 run / attempt / job、自检、产品确认与合并身份 |
| 公开截图 | `delivery-records` 的 `evidence/penpot/`；只公开合成验证或不含设计正文的视图 |

访问修复源码基线：`13774011dc19778d1acf06c4cdfd5c5297c9e749`；实际 Penpot 部署身份：`sha256:5f04a35d2396973a63e280703321db7519f91a0f0abdddf5539056f316ffd7f9`。本次归档追加提交的 SHA 与合并 SHA 由 PR / 永久交付记录保存，不把源码文件写成自己的提交哈希。

## 本次过程与保留的失败

1. 先检查设备、PG 专用权限、入口、账号与备份决定，再部署空实例。初始确认不是最终体验验收。
2. 原生编辑、上传、导出、刷新与重启、权限拒绝和真实云端恢复分别验证，创建负向运维测试。
3. 扩展官方 MCP、个人 ChatGPT、API Token / Webhooks、公网控制台；密钥提交给 ChatGPT 前取得单独明确授权，最终按用户选择无限期。临时 Token / Webhook 测试后撤销或删除。
4. 用户通过 Chat 模式继续设计，原验证文件因此成为真实内容；停止把它当成可清理临时数据。
5. 处理 Enterprise 推广、Wikimedia 网络与请求标识；保存实际通过的图片格式及 SVG 未通过边界。
6. 用户下载报告反馈首页 / 控制台 500；查到共享 PG 重建后端口漂移，修正后端和控制台，并补上原健康检查漏检。未把旧截图或容器 healthy 当作修复证明。
7. 仓库回归是 Xenica 整套检查，不等同于 Penpot 外部部署验证。历史版本恢复场景曾超过两分钟等待，重试后通过但判为 flaky，完整流程自动重跑；失败尝试保存在永久记录中。
8. 自检证据链接曾被 PowerShell 的数组 / 字符串拼接拆开，门禁正确拒绝「实测场景未通过或缺少可查证据」。最终报告使用完整 JSON 字符串构造，并机械检查所有 URL；旧记录不充作有效放行依据，不修改门禁绕过。
9. 用户要求归档并合并。归档追加层分开记录 v0.2.5 已发布事实、此服务的独立部署事实和这次主线提交，不移动已有 Tag / 替换发布附件。

## 升级、复核与补充证据

- 修改配置前核对当前主库实际端口和角色，再验证原账号与两个公网入口；故障时保存接口状态、组件日志摘要和时间，去掉凭据及设计正文。
- 更新镜像前比对同版本官方源码与 MPL 媒体覆盖、Nginx 注入 / MCP 日志策略、数据库兼容性；备份后先隔离恢复，不能自动追踪 latest。
- 每轮自检绑定最终源码与运行摘要，链接应是完整 HTTPS 地址；仓库候选 Xenica 镜像与 Penpot 的外部部署身份分别记录。
- 受保护设计文件只读核对。读取 / 写入测试使用明确可撤销的合成数据，测试 Token 必须撤销；不公开用户后续画布截图。
- 原生全机灾难恢复、跨版本恢复、其他素材来源 URL、SVG 修复、SMTP、第二个账号及 Xenica 内嵌 / Webhook 接收均按清单状态继续，不补造通过记录。

上游考证入口：[官方 MCP](https://help.penpot.app/mcp/)、[原生集成](https://help.penpot.app/technical-guide/integration/)、[组织与控制台](https://help.penpot.app/user-guide/account-teams/organizations/)、[固定版本上游源码](https://github.com/penpot/penpot/tree/2.18.3)、[Wikimedia 请求标识要求](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)。这些链接是考证材料，不能替代部署实测或用户决定。
