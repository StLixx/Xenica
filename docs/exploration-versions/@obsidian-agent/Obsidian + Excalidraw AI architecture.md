# Obsidian + Excalidraw AI 架构画布 — 工作流架构说明

> 本文档描述 **Obsidian + Excalidraw 这套 Demo 系统本身的工作原理与架构设计**。
> 它是一套方法论和工具配置：让 AI Agent 直接操控 Excalidraw 图文件来实现"架构图驱动开发"。
> 不是任何具体软件项目的架构文档。

---

## 1. 系统定位

**一句话：** 把 Obsidian 中的 Excalidraw 画布变成 AI 可直接读写的"架构编程界面"。

```
┌──────────────┐     读/写 .excalidraw.md     ┌────────────────────┐
│              │ ←──────────────────────────→ │                    │
│   AI Agent   │    (直接操作 JSON 明文)       │  Obsidian Vault   │
│              │                               │                    │
│  (任意工具)  │                               │  ├ architecture/   │
│  Cursor      │                               │  │  *.excalidraw.md│
│  Windsurf    │                               │  │  *.excalidrawlib│
│  OpenClaw    │                               │  ├ docs/           │
│  Claude Code │                               │  │  @obsidian-agent/│
│  ...         │                               │  └ AGENTS.md       │
└──────────────┘                               └────────┬───────────┘
                                                       │ 文件变化
                                                       ↓
                                                ┌────────────────────┐
                                                │  Excalidraw 插件   │
                                                │  (自动检测文件变化  │
                                                │   → 实时渲染刷新)   │
                                                └────────────────────┘
```

**关键原则：** AI Agent 不画图，AI Agent 写 JSON。渲染交给 Obsidian。

---

## 2. 为什么这个方案可行

### 2.1 核心洞察：Excalidraw 文件就是可读可写的代码

`architecture/system-design.excalidraw.md` 打开一看：

```markdown
---
excalidraw-plugin: parsed
---

# Text Elements
aBcDeF123: PostgreSQL 数据库
xYzAbC456: React 前端

# Drawing
```json
{
  "type": "excalidraw",
  "elements": [
    {
      "id": "elem_001",
      "type": "rectangle",
      "x": 100, "y": 200,
      "width": 300, "height": 150,
      "boundElements": [{ "id": "aBcDeF123", "type": "text" }]
    },
    {
      "id": "arrow_001",
      "type": "arrow",
      "startBinding": { "elementId": "elem_001" },
      "endBinding": { "elementId": "elem_002" }
    }
  ]
}
```
```

AI 读它 → 知道有哪些元素、它们的类型、位置、连接关系 → 理解架构含义
AI 写它 → 修改/新增元素 → 文件变化触发 Obsidian 渲染刷新

**和 AI 写 Markdown 一个道理。** 不需要任何中间层。

### 2.2 与其他方案的本质区别

| 方案 | 本质 | 为什么不适合这个 Demo |
|------|------|----------------------|
| Mermaid 纯文本 | 写 DSL，渲染引擎编译成图形 | AI 无法精确控制图形位置和样式；不支持素材库图标 |
| MCP Server (mcp_excalidraw) | AI 调 API → Server → 内存 → WebSocket → 浏览器 | 多了 Express + WebSocket + 内存层，AI 看不到底层 JSON |
| Draw.io / PlantUML | XML / DSL，各自有渲染器 | 格式冗长或不够通用 |
| **直接读写 JSON（本方案）** | AI ↔ .excalidraw.md 文件 | **零中间层，AI 完全可控** |

### 2.3 MCP 被否决的技术原因

```
MCP 方案：
  AI → 调 create_rectangle 工具
    → MCP Server (Node.js Express, 需持续运行)
      → 内存 Map 存储元素
        → WebSocket 推送到浏览器
          → @excalidraw/excalidraw React 组件渲染

直接读写方案：
  AI → read .excalidraw.md → 解析 JSON → 理解元素
  AI → write .excalidraw.md → 文件变化 → Obsidian 自动刷新
```

MCP 多出的层：
- Express HTTP 服务（不是项目管理文件，是运行时服务）
- 元素存内存不存文件（AI 无法通过读文件来理解当前状态）
- 浏览器依赖（Obsidian 已经能渲染了，不需要再开一个浏览器）
- 十几个 npm 依赖

---

## 3. 系统组成

### 3.1 必需要素

| 要素 | 角色 | 说明 |
|------|------|------|
| **Obsidian Vault** | 文件存储 + 渲染引擎 | 任何文本编辑器都能写 .md，但渲染需要 Obsidian + Excalidraw 插件 |
| **Excalidraw 插件** | 图表渲染器 | 监听 `.excalidraw.md` 文件变化，自动刷新画布 |
| **AI Agent** | JSON 读写者 | 任意编程 Agent（Cursor / Windsurf / OpenClaw / Claude Code） |
| **AGENTS.md** | Agent 行为规则 | 告诉 Agent 去读哪些文件、遵守什么规范 |
| **excalidraw-spec.md** | JSON 编写规范 | 字段定义、类型列表、约束条件 |
| **library.excalidrawlib** | 素材库 | 可复用的图标和组件模板 |

### 3.2 Demo 仓库结构

```
XENICA/                                   ← 任意项目根目录（本 Demo 的宿主仓库）
├── AGENTS.md                             ← AI Agent 自动加载入口
├── architecture/                          ← 架构图文件（AI 的工作对象）
│   ├── system-design.excalidraw.md       ← 主架构图
│   ├── data-flow.excalidraw.md           ← 数据流图
│   └── library.excalidrawlib             ← 素材库
├── docs/
│   └── @obsidian-agent/                  ← 这套 Demo 系统的配置
│       ├── architecture-overview.md      ← 【本文档】
│       ├── excalidraw-spec.md            ← JSON 元素编写规范
│       └── setup.md                      ← 方案配置记录
├── deprecated-v1/                        ← 历史版本，仅供参考
└── ...项目代码（与本 Demo 无关）
```

---

## 4. 核心机制

### 4.1 AI 如何"读"图 —— 理解架构

1. AI Agent 读 `AGENTS.md` → 知道要去 `architecture/` 读取架构图
2. AI 读 `architecture/system-design.excalidraw.md`
3. AI 解析 JSON `elements` 数组 → 获取所有图形元素
4. AI 解析 Markdown `# Text Elements` 部分 → 获取所有文字
5. AI 通过 `boundElements` 关联文字和图形
6. AI 通过 `startBinding.elementId` / `endBinding.elementId` 理解箭头连接

**AI 能做到的理解：**
- 有哪些组件（矩形 + 绑定文字 = 服务名称）
- 组件之间的关系（箭头方向 = 依赖/数据流方向）
- 分层结构（通过 `groupIds`、位置、颜色判断）
- 哪个是数据库、哪个是前端、哪个是中间件

### 4.2 AI 如何"写"图 —— 操控元素

1. AI 构造新的 JSON 元素对象（按 `excalidraw-spec.md` 规范）
2. AI 写入 `elements` 数组（新增或修改已有条目）
3. Obsidian Excalidraw 插件检测文件变化 → 自动重新渲染
4. 人类在 Obsidian 中看到更新后的图

**AI 能做的操作：**
- 添加新元素（矩形、椭圆、菱形、箭头、文字、图片）
- 修改已有元素的属性（位置、大小、颜色、文字）
- 删除元素
- 改变箭头连接关系
- 分组、对齐、排序

### 4.3 JSON 压缩：关键配置

| 压缩开启 (默认) | 压缩关闭 (必要) |
|----------------|----------------|
| `"elements":"data:application/json;base64,eyJ0eXBlIjoi..."` | `"elements": [{ "id": "elem_001",... }]` |
| AI 看到的是一坨 base64 | AI 看到的是可读 JSON 数组 |
| ❌ 无法直接修改 | ✅ 精确定位、读取、修改 |

### 4.4 文字元素：独立于图形的设计

Excalidraw 的文字**不在** JSON `elements` 数组里。文字和图形是分离的：

```markdown
# Text Elements
aBcDeF123: PostgreSQL 数据库     ← 文字内容在这里（Markdown 部分）
```

```json
{
  "id": "elem_001",
  "type": "rectangle",
  "boundElements": [{ "id": "aBcDeF123", "type": "text" }]
  // ← 图形通过 boundElements 引用文字
}
```

**好处：** AI 修改文字内容只需改 Markdown 部分（冒号后面的内容），不需要碰 JSON 的大段结构。

---

## 5. 素材库（Library）机制

### 5.1 文件格式

`architecture/library.excalidrawlib` 是一个独立 JSON 文件：

```json
{
  "type": "excalidrawlib",
  "version": 2,
  "source": "https://excalidraw.com",
  "libraryItems": [
    {
      "id": "lib_postgresql",
      "status": "published",
      "created": 1700000000000,
      "elements": [
        { "type": "ellipse", ...键值... },
        { "type": "text", ...标签... }
      ]
    }
  ]
}
```

每个 `libraryItems[n].elements` 是一个完整图标的元素集合。

### 5.2 使用方式

1. **GUI 导入：** 插件菜单 → Load Library → 选 `library.excalidrawlib`
2. **直接编辑：** AI 写 JSON 追加新素材到 `libraryItems` 数组

### 5.3 在图中引用素材

```json
{
  "type": "rectangle",
  "customData": {
    "embedInDocument": true,
    "libraryItemId": "lib_postgresql_v1"
  }
}
```

---

## 6. 可靠性策略

### 6.1 防止 AI 写错

1. **类型白名单：** `excalidraw-spec.md` 定义合法 type 值，AI 不得超出
2. **必填字段约束：** 每种类型的最低字段要求已明确
3. **ID 唯一性：** 新增元素必须使用不重复的 ID
4. **引用完整性：** 箭头起点/终点指向的元素 ID 必须存在

### 6.2 查错方式

Obsidian Excalidraw 插件加载时：
- JSON 解析失败 → 控制台报错（不崩溃）
- 引用不存在 ID → 相关元素可能不渲染，控制台警告

AI 自查清单：
- [ ] 所有 `id` 唯一
- [ ] `boundElements[].id` 指向存在的元素
- [ ] 箭头 `startBinding.elementId` / `endBinding.elementId` 指向存在元素
- [ ] `points` 数组至少 2 个坐标对

### 6.3 辅助工具

| 工具 | 用途 |
|------|------|
| `@excalidraw/mermaid-to-excalidraw` | Mermaid 语法 → 元素 JSON（AI 不易出错） |
| `scripts/export-elements.cjs` | 导出素材库 |
| `scripts/import-elements.cjs` | 导入素材库 |

---

## 7. Skill vs AGENTS.md：为什么不用 Skill

| | AGENTS.md | Skill 文件 | MCP Server |
|---|---|---|---|
| **存储** | 项目根目录 `.md` | 工具内部或独立文件 | npm/Python 包 |
| **换工具需要重新安装吗** | ❌ 不需要，所有工具自动读取 | ⚠️ 是，Claude Code 需 `claude mcp add` | ✅ 是，npm install |
| **跨工具通用** | ✅ Cursor/Windsurf/OpenClaw/Claude Code 全部支持 | ⚠️ 主要是 Claude Code 生态 | ❌ 仅支持 MCP 的工具 |
| **Git 版本控制** | ✅ 代码的一部分 | ⚠️ 可能不在项目目录 | ❌ 在 node_modules |

**结论：** 这个 Demo 追求"换工具打开同一个项目，一切规则都在"。AGENTS.md + 子引用 `.md` 文件是最佳选择。

---

## 8. 方案配置记录

| 配置项 | 当前值 |
|--------|--------|
| JSON 压缩 | **关闭**（必须） |
| 图表文件位置 | `architecture/*.excalidraw.md` |
| 素材库位置 | `architecture/library.excalidrawlib` |
| 规范文档 | `docs/@obsidian-agent/excalidraw-spec.md` |
| 工作流说明 | `docs/@obsidian-agent/architecture-overview.md`（本文档） |
| AI 操控方式 | 直接读写 `.excalidraw.md` JSON |
| 渲染引擎 | Obsidian + Excalidraw 插件（文件监听 → 自动刷新） |
| 辅助工具 | `@excalidraw/mermaid-to-excalidraw`（Mermaid 快速生成初始图） |
| Agent 工具范围 | **不限制**，任何支持读取项目文件的 Agent 均可使用 |

---

## 9. GitHub 分支策略

```
当前开发 → main
历史版本 → deprecated-v1（标记为过时/放弃）

规则：
  重构时 main → 改名 deprecated-v{N}
  这是个人私有仓库，通过 GitHub CLI (gh) 操作
```

---

## 10. Agent 约束清单

每次 AI 开始工作时，必须遵守：

1. 架构图是架构的唯一权威——图中没定义的，代码中不得出现
2. 修改架构前先改图，再改代码
3. JSON 压缩保持关闭
4. 所有元素 ID 唯一
5. 箭头引用必须指向存在的元素
6. 文字元素独立管理，通过 `boundElements` 关联图形
7. `deprecated-v1/` 仅供历史参考
