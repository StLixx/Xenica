# Xenica 本轮讨论要点总汇

本文档整理自 2026-07-06 讨论 thread，作为后续开发 thread 的背景上下文。

---

## 一、项目定位与哲学根基

源文档：`docs/Xenica-Genesis/`（只读，AI 禁改）

Xenica（织念）是个人思维伙伴——异质信息的智能连接体。核心问题：人类大脑进化滞后于文明发展，石器时代认知（及时回报、具体、局部）不适配现代场景（延迟回报、抽象、多模态），工作内存窄（约 4 组块），长期记忆模糊且重建性。

六条核心理念：
1. **信息原子化本体化**——文件、关系类型、属性等在底层平等视作节点
2. **属性即节点**——安全属性、日期、复选框状态都是节点，不是属性列；"已完成"作为节点可以有自己 outgoing 的边，支撑"完成事项将来产生新回响"
3. **跨格式知识同一性**——视频时间戳、书籍段落、脑海感受、代码函数可能传达同一知识，系统要能关联
4. **工程实践与交互直觉的解耦**——工程的形式化结构与人脑自由联想的交互直觉分开
5. **高效无损可叠加**——支撑累积性文化，所有突破本质是已有知识碎片的重组拓扑
6. **没有最好的工具只有相对适用的工具**——线性文本不该用于所有认知场景，因地制宜

## 二、技术选型

| 组件 | 选型 | 状态 |
|------|------|------|
| 后端语言 | Rust | 用户认可 |
| Web 框架 | Axum | 已向用户解释并认可（Tokio 团队维护，最主流） |
| DB 库 | sqlx | 已向用户解释并认可（编译期 SQL 检查） |
| 数据库 | PostgreSQL 17 | 用户亲自论证（见 exploration-versions/deprecated-v1/reflection-tech-stack.md） |
| 向量搜索 | pgvector | v1 论证，待用户逐个确认 |
| 图查询 | 递归 CTE + Apache AGE（按需） | v1 论证，不用 Neo4j |
| 模糊搜索 | pg_trgm | v1 论证，待确认 |
| 中文全文搜索 | zhparser 扩展 | blindspot 扫出，PG 默认不分词中文 |
| API 风格 | REST/Action，不用 GraphQL | 已确认 |
| 消息队列 | 不用 RabbitMQ，PG LISTEN/NOTIFY | 已确认 |
| 前端 | defer（Flutter 是候选但暂不定） | 待后端跑通后再选 |

技术选型标准：优先成熟（3 年+口碑好）技术栈，减少 AI 从零写；不用 3 年内新出或口碑差的。

## 三、架构设计决策

1. **后端优先，前端 defer**——数据模型和 API 是稳定核心，前端只是视图层。CLI 作为第一个客户端就够"make it work"。
2. **API 是绝缘层**——前端变更不传导后端。API 围绕领域动作设计，不围绕表结构或 UI 屏幕。
3. **同步/异步分场景**——简单操作（创建节点、连边、查询）走同步，API 直写 PG 直接返回；长耗时多步骤任务（视频导入、批量爬取、AI 处理）走异步，PG LISTEN/NOTIFY 触发 worker，不用 RabbitMQ。
4. **错误处理**——Rust `?` + 统一错误响应格式，编译期强制处理错误分支。属实现机制，用户转向全权理解后也需了解。

## 四、数据模型设计

文档：`backend/design/01-data-model.md`（已出，用户尚未正式拍板但无异议）

两张表，没有第三张：

```
nodes: id(UUID) + content(TEXT) + created_at + updated_at
edges: id(UUID) + source_id(UUID→nodes) + target_id(UUID→nodes) + label(TEXT) + created_at
```

- **属性即节点**：没有 properties 表，"已完成""2026-07-04""物理"都是节点，通过边关联。代价是取属性要 JOIN，好处是属性本身可被关联。
- **边 label**：自由文本 + 约定（选项 A），不预设约束，高频标签自然涌现后再标准化。
- **节点类型**：软类型（选项 B），type 列可选可改，是查询 hint 不是硬约束。
- **content**：TEXT 纯文本，结构化信息通过边关联。

02 类型系统的疑问从 01 自然引出：边的 label 能随便写吗？节点要分类型吗？文档中列了三个选项各给了判断，待用户拍板。

## 五、设计文档路线图

文档：`backend/design/00-overview.md`（已出）

从创世纪源文档提炼，11 个主题：

**make it work 最小集（定了就能写代码）：**
1. 数据模型：信息怎么存
2. 类型系统：节点/边要不要分类型
3. API 动作集：CLI 和 AI 能做什么
4. 同步异步：哪些立即返回哪些后台跑

**可后补（先定方向，细节随用随加）：**
5. 外部内容导入（课程爬取、文件导入）
6. 多媒体处理管道（视频转录、课件提取）
7. AI 对话节点化（对话变图、Q&A 链追溯）
8. 搜索（全文、语义、非文本检索）
9. AI 辅助分析（价值判断、目标偏离、知识边界）
10. 安全与访问控制（安全属性即节点、L2、生物识别）
11. 知识版本与演化（旧版本、演化边、冲突观点）

指导原则（贯穿所有设计）：跨格式知识同一性、工程与直觉解耦、高效无损可叠加。

## 六、后端开发流程（7 步）

1. **配环境**——Rust 工具链 + PostgreSQL + IDE（已完成）
2. **项目骨架**——cargo init，声明依赖（axum/sqlx/tokio/serde/uuid/chrono），搭目录结构
3. **建表**——写第一份 migration（nodes + edges 两张表），跑 migration，连数据库验证
4. **Rust 数据模型**——定义 Node/Edge 结构体，sqlx 实现读写函数
5. **API 路由**——Axum 定义 HTTP 路由，接 sqlx 查询，统一错误响应
6. **测试**——集成测试：创建节点→连边→遍历邻居→验证
7. **CLI 客户端**——命令行工具调 API，能存知识查知识连关系

嵌入的设计决策：第 3 步前需拍板 01 数据模型 + 02 类型系统；第 5 步前需出 03 API 动作集 + 04 同步异步。

## 七、仓库结构

commit `aba592d` 完成清理。结构：

```
Xenica/
├── README.md                    目录索引
├── AGENTS.md                    Xenica-Genesis 只读规则（一句）
├── .gitignore                   含 参考/、backend/.env 等
├── .obsidian/                   基础配置已追踪（app.json/appearance.json/graph.json）
├── docs/
│   ├── Xenica-Genesis/          🔒 只读，用户亲自写
│   ├── design/                  设计文档（空，预留）
│   ├── exploration-versions/    旧方案归档（@obsidian-agent + deprecated-v1）
│   └── used-experience/         参考软件体验笔记
├── backend/
│   ├── .gitkeep
│   └── design/                  后端设计文档（00-overview + 01-data-model 已出）
├── frontend/.gitkeep            预留
├── scripts/.gitkeep             预留
├── obsidian-assets/             Obsidian 附件
└── 参考/                         gitignore，本地保留（Heptabase/TheBrain 逆向产物）
```

已删除：v1 全部代码（backend/frontend/corpus/design_samples/.reports）、废弃 Excalidraw 脚本（scripts/*.cjs）。sparse-checkout 已禁用（旧配置曾隐藏 v1 代码）。

## 八、环境配置

| 组件 | 版本 | 备注 |
|------|------|------|
| rustc | 1.93.0 | stable |
| cargo | 1.93.0 | |
| rustup | 1.28.2 | host: x86_64-pc-windows-msvc |
| MSVC | VS 2022 Enterprise, 14.44.35207 | link.exe 正常 |
| PostgreSQL | 17.10 | winget 静默安装，服务运行中 |
| 数据库 | xenica | UTF8, localhost:5432 |
| 超级用户 | postgres | 密码: postgres |
| IDE | VS Code + rust-analyzer | 用户自配 |

连接串：`postgres://postgres:postgres@localhost:5432/xenica`

## 九、工作模式与用户偏好

**用户身份**：高中生开发者，自述新手但理解力强（能讨论阻抗失配、事件驱动等概念）。

**开发模式转变**（2026-07-06）：从"实现机制类不想理解，AI 管"转为"全权掌控，每个设计和代码背后的逻辑都要自己审核理解，边学边做"。代码可由 AI 写，但思路逻辑用户必须看懂。理由：不审核则把控不了方向；边做边学加深理解。

**讨论节奏**：一次只研究单个问题，用户主导提问节奏。信息源优先级：用户手写内容 > AI 生成文档。

**上下文管理**：用户准备开 L1/L2/L3 分层 thread（L1 总体进度把控，L2 模块级，L3 函数级），不在本 thread 讨论。

**访问权限分级**（口头约定，不写进文件）：
- `docs/Xenica-Genesis/`：用户写，AI 禁改
- `backend/design/`：AI 产出，用户审
- `backend/src/`、`frontend/`、`scripts/`：AI 管
- `docs/exploration-versions/`：归档

## 十、Blindspot pass 扫出的待解决问题

| 问题 | 说明 | 何时处理 |
|------|------|----------|
| 属性即节点性能代价 | 取属性 = JOIN，属性多了会慢，需加索引或缓存 | make it work 后 |
| 图遍历深度爆炸 | 递归 CTE 深度一大组合爆炸，需加深度上限 | 第 5 步 API 路由时 |
| 中文全文搜索 | PG 默认不分词中文，需装 zhparser 扩展 | 第 8 主题搜索时 |
| embedding 放哪 | pgvector 存向量，但"属性即节点"原则下 embedding 算属性还是节点？设计张力 | 第 8 主题搜索时 |
| 多媒体文件存哪 | 视频/音频不能存 PG（太大），PG 只存元数据+转录文本，文件存磁盘 | 第 6 主题多媒体管道时 |
| 知识版本 | 节点内容改后旧版本留不留？演化边连接冲突观点？ | 第 11 主题版本演化时 |

## 十一、逆向产物参考

- **Heptabase**（`参考/Reverse/work/heptabase/`）：React+Redux+Vite，前端压缩混淆不可照搬。但 `cliActionSchema.js` 用 Zod 定义 35+ CLI 动作（card/note/whiteboard/tag/journal），是"API 即 CLI"数据模型参考。
- **TheBrain**（`参考/Reverse/work/thebrain/`）：Blazor Server（C# .NET），栈不兼容。但 `plex/` 下 `plexAnimator.ts`、`outlineLayout.ts` 布局源码可读，前端阶段参考。
- 用户对参考价值不确定：原意是减少开发量和防出问题，但不确定能否真提供参考。

## 十二、AGENTS.md 当前状态

仅一句规则：`docs/Xenica-Genesis/` 下存放个人亲自组织语言的思考，AI 只读禁改。

用户提到要维护 AGENTS.md 和相关 SOP/工作流，但尚未具体讨论要加什么内容。后续 thread 中需确定 AGENTS.md 是否补充技术栈、目录结构、工作模式等规则。
