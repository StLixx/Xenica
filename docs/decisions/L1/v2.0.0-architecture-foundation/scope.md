## L1 / architecture-foundation

> 这是 Xenica 项目的**第三个 L1 thread**。上一个 thread（project-foundation）建立了分层管理体系、文档结构、ADR 标准和工程原则。本 thread 在此基础上，从 Genesis 定义的实际使用场景出发，推导支撑 Phase 1 "make it work" 的最少架构。

## 目标

从 Genesis 定义的实际使用场景出发，推导出支撑 Phase 1 "make it work" 所需的最少架构，让第一个 L2 thread 能拿着它开始写代码。

## 范围

### A. 场景提炼与分层

从 Genesis（`docs/genesis/`）提炼出 10 个使用场景，明确 Phase 1（make it work）需要支撑 S1 + S7 + S6：

- **S1 知识录入与连接**：用户将一段文字（教材段落、想法、引用）存入系统，并通过边连接到已有节点
- **S7 聚焦式节点探索**：用户聚焦某个节点，查看它连出去的所有边和邻居节点
- **S6 知识图谱导航与定位**：用户查看全局概览，了解自己在知识版图中的位置

场景描述以用户动作为主语，不涉及技术实现语言。

### B. 场景 → 数据流 → 架构约束 → 技术选择 → ADR

对每个 Phase 1 场景：

1. 画出该场景的数据流
2. 从数据流汇总出系统需要的组件
3. 从组件之间推导接口形态
4. 从数据需求推导数据模型
5. 每一项技术选择写成 ADR（what + why + avoided），why 必须追溯到具体场景

### C. L1 架构图

C4 System Context + Container 层：
- 外部角色
- 内部容器
- 数据流方向

### D. 开发路线图

Phase 1 步骤拆到 L2 thread 可接手的粒度。Phase 2+ 只列主题名称。

### E. 划定第一个 L2 thread 的 scope

明确 L2 的目标、输入、产出。

## 不在范围

- PostgreSQL 扩展的具体选型 → 留给 L2
- 异步 worker 的具体实现方案 → 留给 L2
- 任何代码实现 → 留给 L3
- Phase 2+ 场景的详细设计
- 前端 UI 设计

## 终止条件

以下全部完成且用户确认后，本 thread 结束：
- Phase 1 场景（S1 + S7 + S6）已明确，每条场景有对应的数据流描述
- 所有 Phase 1 架构决策已写成 ADR，status = accepted，why 追溯到具体场景
- L1 架构图已产出
- 第一版开发路线图已定稿
- 第一个 L2 thread 的 scope 已定义
- handoff 已产出
