# 0005 部署

状态：已采纳 · 2026-10

## 决定

```
浏览器 → xenica.truebigsand.top → hikari（1Panel/OpenResty：TLS + 反代）
       → Tailscale → core-server（Docker：xenica + postgres:18）
```

- 一个应用镜像（`Dockerfile`），由 CI 在 master 上构建并推送到 `ghcr.io/stlixx/xenica`，标签 `latest` 和 commit SHA。
- `deploy/compose.yaml` 跑应用和数据库。数据库不映射端口；应用端口只绑 Tailscale IP，公网只能经过 hikari 进来。
- DNS 在 Cloudflare，仅 DNS 模式（不走 Cloudflare 代理）；证书由 1Panel 用 Cloudflare DNS 验证申请。
- 部署由 Agent 照 `AGENTS.md` 执行；Cloudflare token 只通过环境变量 `CLOUDFLARE_API_TOKEN` 提供，权限只限该域名的 DNS 编辑。

## 理由

- core-server 在家里，没有公网 IP；hikari 有公网 IP 且已经跑着 1Panel，复用它做入口。
- Tailscale 让两台机器之间的流量加密，core-server 不需要对公网开任何端口。
- 镜像按 commit 打标签，回滚就是改一个标签。
