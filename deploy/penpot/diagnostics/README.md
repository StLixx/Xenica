# 私有验证辅助代码

从 2026-10-14 实际使用的 Infra `/var/lib/penpot-ops/` 复制，归档前按现有私有凭据扫描，代码不含凭据值。它们是验证函数，不是生产守护进程；导入只定义接口，写入/撤销等操作由调用者在批准的范围内显式执行。

- `access.py`：1Panel 原生时间戳签名、既有 Cloudflare DNS 账户访问及 root 私有结果保存。依赖 `panel.key` 和 `dnsaccounts.json`。
- `integration_probe.py`：HTTPS RPC、Cookie 会话、从私有 `bootstrap.json` 登录及 root 私有报告保存；用于实际 API Token / Webhook / 媒体验证。返回值可能含账号资料或 Token，不直接打印或发布。
- `mcp_probe.py`：原生 JSON-RPC / SSE 调用、会话头和无效密钥验证。依赖私有 `integration-session.json`；会话及活动文件需要重新核对，完整 URL 不公开。

优先使用可用的官方 MCP 接入；协议辅助代码用于补充考证。原始错误可能含 URL 或私密值，先保存私有再脱敏。保护设计清单中的文件只读核对；可撤销写入验证用独立合成文件，结束撤销 Token / 清理测试资源。
