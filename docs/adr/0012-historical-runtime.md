# 0012 历史体验与永久档案分离

状态：实施中，等待整体验证和用户交互验收。

历史镜像固定 registry digest，恢复与它一起归档的 PostgreSQL 快照。实例不连接正式库、不公开端口；限定的代理域名承接一次性授权，不复用正式登录 Cookie。凭据只在私有密钥文件中。

启动请求、代次、状态和授权通过 Store 事务写痕迹。容量为两个；十五分钟无活动转为释放，确认容器删除才释放资格。停止后重开使用原快照，批注继续保存在唯一开发画板。目录缺失不猜测版本。

部署器只能读取归档目录和受限队列。应用没有 Docker socket。动态运行 SQL 的安全性由真实数据库集成测试验证；新增表不改变历史快照。外部快照的兼容性必须实际恢复验证。

依据（Tier S）：[Docker immutable digests](https://docs.docker.com/dhi/explore/security-concepts/digests/)。
