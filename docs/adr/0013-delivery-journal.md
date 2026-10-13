# 0013 同仓库永久交付记录

状态：实施中，等待验证。

`delivery-records` Git 分支是追加式交付日志。候选、工程证据、自检、体验原话及上线推广分别保存内容哈希；索引串联全部记录。保存失败不能放行。独立分支避免写记录改变候选源码身份。

正式流水线不重建体验过的镜像。核对源提交与合并提交的内容树、规则指纹和最新工程检查后，推广同一 digest。GitHub 严格主线保护继续承担合并时的原子约束。

私密原图、原始设计、数据库快照留在持久存储。仓库保存身份与校验值，恢复入口见 `docs/context/v0.2.5-canvas-archive.md` 与历史运行目录；不公开令牌或快照。

依据（Tier S）：[GitHub Git database](https://docs.github.com/en/rest/git)、[strict checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。
