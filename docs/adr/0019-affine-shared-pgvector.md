# 0019 AFFiNE 复用现有 PostgreSQL 与 pgvector

2026-10-16，已批准并实施；用户体验后确认部署无问题并要求先合并，MCP 试验另行搁置。

用户要求按 Penpot 的运维标准部署 AFFiNE，并明确未来 Xenica 需要向量数据库，pgvector 使用现有实例。采用 Infra panel-main PostgreSQL 18.6 的原数据卷与端口，以相同不可变基础镜像编译 pgvector 0.8.7；先从现有备份隔离恢复验证，再更新运行镜像。AFFiNE 使用独立库与非超级角色，不新增长期 PostgreSQL 容器，不迁移 Xenica 其他实例。

扩展二进制在实例级提供，CREATE EXTENSION 在数据库内单独授权。未来其他 Xenica 实例仍须分别做兼容性、保护链和容量检查，本次没有给它们安装扩展。镜像源码、备份脚本和可公开证据回到仓库；私有凭据与原始文档只在私有存储。恢复须包含数据库、文件、配置和确切运行镜像。见 [运维入口](../context/affine-operations.md)。
