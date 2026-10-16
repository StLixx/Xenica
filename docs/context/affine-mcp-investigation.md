# AFFiNE MCP 调查与停止状态

2026-10-16 调查快照。用户最后决定「那就不管了先提交合并到 v0.2.5 吧」，因此本次只完成稳定版部署，MCP 集成搁置。

## 已确认能力

稳定版 0.27.4 的实际 tools/list 只有 `doc_search`、`read_document`。原生接口 `/api/workspaces/{workspace-id}/mcp` 使用独立工作区 Bearer 凭据；自托管需要 Copilot 功能开关，不等于必须配置模型提供方。已实际读取「部署验证」文档；未接入模型密钥。

开发分支在 READ_WRITE 凭据且 dev/canary 环境下额外开放三个工具：`create_document`（标题与 Markdown 新建）、`update_document`（正文结构差异更新）、`update_document_meta`（目前仅标题）。完整工具表仍没有白板节点、连线或布局编辑入口；图片与数据库块的插入/更新也不受支持。依据 [固定提交源码](https://github.com/toeverything/AFFiNE/blob/0b69a6da21e8fd35beb85667bb8496d9b3852238/packages/backend/server/src/plugins/copilot/mcp/provider.ts) 和 [官方 MCP 说明](https://affine.pro/mcp)。

## CI/CD 核查

canary 当前头 `0b69a6da21e8fd35beb85667bb8496d9b3852238`：

- [Build & Test 38148734635](https://github.com/toeverything/AFFiNE/actions/runs/38148734635) 失败：E2E Mobile Test (1) 的 Playwright 测试失败，汇总门随之失败；服务器测试及搜索后端测试成功。
- [Release 38148786308](https://github.com/toeverything/AFFiNE/actions/runs/38148786308) 构建镜像和发布 Docker 镜像成功。10 月 16 日 [定时发布](https://github.com/toeverything/AFFiNE/actions/runs/38878434273) 也成功，但 Docker 重新打标签步骤被跳过，不能将工作流整体绿色等同所有步骤执行。
- [Copilot Cron Test 38872036975](https://github.com/toeverything/AFFiNE/actions/runs/38872036975) 失败：前端 Copilot E2E 分片 8/10 失败，服务器 API 测试成功。

向前找到 `9be1a8284a99f70dbabb186552b863701bff0188`，包含同样三个写入工具。[Build & Test](https://github.com/toeverything/AFFiNE/actions/runs/38063750537) 成功（58 项成功、2 项 Copilot 测试跳过），[手动 Release](https://github.com/toeverything/AFFiNE/actions/runs/38070412760) 成功；但该提交后续定时发布与 Copilot 定时测试均失败。因此未得出「所有 CI/CD 全通过且已验证 ChatGPT 编辑」的候选，没有部署开发版。失败作业日志 API 返回 403，未将其归因为偶发错误。

## ChatGPT 试验与回退

原生固定 Bearer 接口与当时 ChatGPT 自定义 MCP 表单的 OAuth 配置不直接匹配，曾制作仅允许读取的 OAuth 网关原型。SDK 层的 PKCE、令牌刷新/撤销、权限过滤、工作区所有者和 CSRF 测试通过；ChatGPT 插件已创建，但授权提交遭 Edge ERR_BLOCKED_BY_CLIENT，尚未完成 Chat 页面真实调用，未发出授权访问令牌。不能称为接入成功。

试验关键词索引只建立 doc 表，block 表未成功建立，搜索没有形成可交付结果。用户搁置后，专用上游凭据已撤销，新增代理路由已移除，网关与索引试验容器停止且 restart=no，Compose 与功能开关恢复。用户工作区和文档未回滚。ChatGPT 中可能仍有尚未连接的 AFFiNE 插件条目；本次未替用户删除插件。

私有运行快照位于 `/var/lib/affine-ops/mcp-deferred/`，源码原型留在 Infra Git stash；它们不是长期部署依赖，不是合并成果。未来重启需求应重新核对源码、CI、迁移与权限；若要写入，需要明确授予写权限，不能复用本次只读授权。
