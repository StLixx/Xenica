# MinerU 接续

2026-10-17。范围批准与交互验收分开；当前未获得用户结束验收，禁止合并。

- 阅读入口：spec.md → reverse-engineering.md（块与对照 UX）→ protocol.md（Desktop 鉴权/真实 API）→ deploy/mineru/README.md（部署、回退、恢复）。
- 制品：Desktop 0.14.1 原始安装包、匹配本机 ASAR/EXE、REA 原记录与可恢复来源保留在私有研究档案；evidence/artifact-identity.json、original-asar-rea.json、research-freeze.json 标明覆盖与恢复限制。公开仓库只有摘要、精确范围与自制样本截图。
- 实际应用：https://mineru.truebigsand.top，沿用已有 test 账号登录；Rust、既有 panel-main 的独立 mineru 库、服务端 Desktop 两层凭据。无自托管识别模型；不需先创建个人 Token。
- 独立应用验证：backend-engineering.json、backend-smoke.json（26项真实 API/重启/权限检查）、frontend-live-checks.json（18项真实 HTTPS 交互与最终桌面/窄屏截图）、deployment.json（编译/运行/公网文件身份）。
- 最终应用云恢复：application-recovery.json；六文件从云回取、隔离库4表行哈希、24附件与66个运行文件验证。每日03:45上海时区备份，最多随机错峰120秒。角色重建、整机丢失、跨版本恢复未验证。
- 仓库根检查：repository-checks.json 保留 Infra 本地失败、主线对照和同源 GitHub 检查，不能把后来通过覆盖早期失败，也不能把根应用通过当作 MinerU 体验验收。

## 明确的后续边界

本轮支持 PDF，其他 Office/图像导入、结果编辑、Xenica 主工作台集成不在当前成果中。原桌面对照页关键点击受用户禁止全局 Computer Use 约束，结论按静态/附件/独立运行区分。最新 API merge_prev=true 尚未实际观测，不能据字段名无条件合并；选择定位有源码依据，持续滚动联动是本应用可关闭的设计扩展。

研究原件已完成 Infra 与独立 core 的完整摘要验证并加密上传云；1 GB 研究全档的云端完整下载解密尚未完成，单连接回取仍约100 KB/s。已停止本任务的大流量回取，原件、快照和密文保留；不能用云端对象存在或前缀一致宣称全档恢复通过。此限制与已完整通过的小体积应用备份云恢复分别记录。

用户实际体验通过后，重新核对最终源码/产物/工程检查，再依 docs/task-lifecycle.md 登记用户原话和准确产品身份，最后合并；当前“开始”仅记录为范围授权。
