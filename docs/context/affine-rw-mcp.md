# AFFiNE 读写 MCP 接续

2026-10-17（Asia/Shanghai）用户重新授权实现读写，先 ChatGPT Plugin / Chat，再 Notion AI，要求自主完成、不要提问。#76/#77 稳定部署已独立完成合并；本任务使用 #79、Xenica PR #80 与 AFFiNE Fork PR #1，未修改另一会话工作树。交互体验仍待用户本人确认，不自行合并或登记产品验收。

## 当前结果

- 固定 HTTPS MCP：`https://affine.truebigsand.top/rw-mcp`，OAuth；插件名 `AFFiNE Read Write`。ChatGPT 旧的 `AFFiNE` 只读试验条目保留，不混用。
- ChatGPT Chat 与 Notion AI 均已真实完成中文搜索、读取、新建、改正文、改标题、最终回读；服务重启后双向读取另一端文档通过，授权持续有效。AFFiNE 网页实际显示两份最终文档，刷新后保留。
- 实现使用 0.27.4 原生转换与同步，没有更换稳定应用，没有启用 Copilot、搜索索引或模型提供方。搜索支持中文，当前是最多 1,000 文档的实时扫描，不是大型工作区全文索引。
- 身份、镜像、验证时间和结果以 [公开证据](../../deploy/affine-rw-mcp/evidence.json) 为准；运维、恢复、撤销和升级见 [部署手册](../../deploy/affine-rw-mcp/README.md)。原稳定应用与数据库见 [AFFiNE 运维](affine-operations.md)。

## 能力边界

正文编辑支持简单单笔记 Markdown：段落、标题、列表、待办、代码、分隔线；图片、数据库、嵌入、公式、复杂行内对象、多个笔记或非空白板拒绝正文替换。标题更新保留原正文。没有删除、白板节点/连线、任意代码执行或跨工作区工具。调用者读完取得 `revision`，更新传入 `expected_revision`；每个写操作使用独立 `idempotency_key`，不确定结果用原参数和原键重试。

版本检查可拒绝已观察到的旧版本；检查与同步推送之间没有上游原子比较交换，因此同一段落并发修改不能承诺无冲突。支持原生 CRDT 的独立块差异合并；不要把测试通过夸大为所有并发编辑都安全。幂等意图与结果是私有持久状态，包含必要文档内容，不进入 Git。

## 连接维护与历史问题

授权需在浏览器登录该 AFFiNE 工作区所有者。OAuth 只允许 ChatGPT/Notion 的批准回调，S256 PKCE、CSRF 和固定 audience 生效。读写权限分别为 `affine:read`、`affine:write`；访问令牌一小时自动刷新，连接最长三十天，到期需重新连接。浏览器未登录、连接被撤销、上游权限变化或网络中断应报错，不能回退成匿名读取。

实际修复了两项集成问题：Edge 中顶层表单提交曾返回 `ERR_BLOCKED_BY_CLIENT`，改为带随机脚本 nonce 的同源 POST，再跳转 OAuth 回调；没有关闭浏览器保护。ChatGPT 对只有文本的读取结果出现 `{}`，增加标准 `structuredContent` 后正文和标题更新的完整调用通过。Notion 弹窗输入通道超时，使用同浏览器普通标签页完成同一授权请求后正常连接。具体根因未全部确定，以上是可重复验证的解决路径，不推断成平台通用限制。

历史调查 [MCP 调查与停止状态](affine-mcp-investigation.md) 记录 #76 当时的停止决定，仍保留原证据；本条目是后续重新授权后的新结果。技术决定见 [ADR 0020](../adr/0020-affine-read-write-mcp.md)。
