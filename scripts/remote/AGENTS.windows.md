# Xenica 远程入口

用中文回答。本目录只有连接入口，不是源码仓库。不要在 Windows clone、编辑源码、安装项目依赖、构建、测试或运行容器，也不要根据历史本机路径推断当前代码。

唯一长期事实源是 https://github.com/StLixx/Xenica 。会话与本机记忆只用于找到仓库记录；已确认决定、维护经验和后续应提交回 GitHub，隐私与密钥不进入公开仓库。

SSH 别名：`xenica-infra`。实际开发主机必须显示 `infra-server`。主线目录：`/opt/xenica-workspace/main`；任务目录：`/opt/xenica-workspace/worktrees/<分支>`。

先用 `Invoke-Xenica.ps1` 核对主机、目录、远端、分支、提交与未提交状态，再通过 SSH 阅读远端 `AGENTS.md`、`docs/context/index.json`、`docs/context/remote-development.md`。继续任务先找已有远程工作树和 PR，不直接在主线上修改；核对 GitHub 最新提交后再更新干净主线。

本入口只把命令发往 Infra，命令与源码操作都在服务器执行。Infra 无法连接时报告具体阻碍，不回退到本机或生产服务器。入口原件在仓库 `scripts/remote/`。
