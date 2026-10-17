# 0022：MinerU 解析与对照阅读宿主

状态：已部署并完成 Infra 应用/仓库自检；最终提交自动检查与用户交互验收分别登记，当前未合并。2026-10-17。

## 决定

按用户批准，以 Desktop 0.14.1 的制品、REA 证据和真实远程 API 为依据实现独立 Web 应用。应用后端为 Rust，复用 Infra 的 panel-main PostgreSQL 18.6，独立 mineru 库与受限角色；不自行部署识别模型。原文件与服务原始结果不可变，派生块可重算；物理来源位置与共享逻辑块 ID 分开保存。

先使用用户现有 Desktop 安装的应用凭据与客户端标识，服务端保管并实测两层鉴权；个人 API Token 仅作为后续替换路径，不把应用凭据的可用性推断为永久承诺。凭据、原始闭源包及私人文档不公开。独立域名 mineru.truebigsand.top 使用现有私人工作区身份验证。

## 原因与边界

分割检测发生在远程服务，Desktop 负责块适配、题注拆分、续块关联和原文映射。不能用扁平 content_list 编造坐标；保留完整 layout 和未知类型，缺坐标时明确降级。Xenica 可复用这套逻辑块/来源区域关系，但本轮不改主工作台。

选择驱动双向定位有静态依据；持续滚动联动作为本应用可开关设计扩展。用户明确禁止全局 Computer Use，所有后续运行验证在 Infra 独立环境完成。

## 证据与接续

见 specs/87-mineru/spec.md、reverse-engineering.md、protocol.md 及 evidence/，部署与恢复见 deploy/mineru/README.md。安装包身份须按摘要重核；新 API/model schema 不沿用旧静态假设。开始为范围批准，不能替代结束后的真实交互验收。
