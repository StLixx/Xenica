# 候选预览的临时部署接续

正式应用仍保持旧产物。2026-10-11 为验证候选的持久档案挂载，core-server 的部署器使用 `/opt/xenica-history-preview` 中的本仓库源码；私有 `.env` 保留在该目录，不覆盖或写入仓库。

`/etc/systemd/system/xenica-deployer.service.d/preview-bootstrap.conf` 将 ExecStart 指向该 checkout 的 `deploy/deployer/deploy.sh`，限定 `XENICA_ONLY_PREVIEW=55`。`xenica-history-preview.timer` 调用同 checkout 的历史部署器，父容器为 `xenica-pr-55-app-1`。这两项只用于验收前预览，不能视为正式上线。

用户实际体验通过后：先按交付门核验并推广同一 digest，备份正式数据库和原件，关联正式唯一画板；再移除上述临时 service override，恢复主线部署器，安装仓库中的 `xenica-history.service/timer`。复核正式产物、持久目录挂载、历史恢复和永久记录。失败保留预览及档案，恢复之前运行产物。

首次合并前默认分支仍是旧评论工作流。验收后先将候选暂转 Draft，执行候选的新门禁保存绑定产物与真实原话的验收；再让旧工作流接收附带相同身份的 `/通过`，只建立 GitHub Actions 的状态，Draft 阻止旧门合并。核对状态与源码后恢复 Ready，由候选流水线重新检查并读取永久验收，再自动合并。相同源码重跑复用并核验已归档 digest，不重新构建替换已体验产物。任何源码、产物、主线或规则变化仍阻止放行。此一次性步骤不能提前用于尚未体验的成果，也不能停用主线保护。

历史档案及原始设计分别在 `/var/lib/xenica-history`、`/var/lib/xenica-design-archives`，不能随 PR 清理。两个实际归档版本已在预览恢复、核对源码和 Docker 镜像摘要，并验证单次桥接和匿名访问拒绝；其它旧版本缺少完整档案，仍标记不可用。
