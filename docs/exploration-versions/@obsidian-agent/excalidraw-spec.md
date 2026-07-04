# Excalidraw JSON 编写规范

> AI Agent 编写 Excalidraw 架构图时参考此文档。所有图表最终写入 `.excalidraw.md` 文件，由 Obsidian Excalidraw 插件渲染。

---

## 文件格式

`.excalidraw.md` 是 Markdown 文件，数据体在 `compressed-json` 或明文 JSON 代码块中。**插件设置中关闭压缩后，数据为明文 JSON。**

```markdown
---

excalidraw-plugin: parsed
tags: [excalidraw]

---
# Excalidraw Data
## Text Elements
## Drawing
```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [...],
  "appState": {...},
  "files": {}
}
```
```

---

## 坐标系统

**(0, 0)** 为画布原点，**x 向右增加**，**y 向下增加**。

### 间距指南

| 场景 | 推荐值 |
|------|--------|
| 层级间垂直间距 | 80–120px |
| 同级元素水平间距 | ≥ 40px |
| 形状最小宽度 | `max(160, 文字长度 × 9)` |
| 单行标签高度 | 60px |
| 双行标签高度 | 80px |
| 分组框内边距 | 50px |

---

## 元素类型

### 1. 矩形 (rectangle)

```json
{
  "id": "pg-db",
  "type": "rectangle",
  "x": 100, "y": 200,
  "width": 180, "height": 60,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "#a5d8ff",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "angle": 0,
  "roundness": { "type": 3 },
  "groupIds": [],
  "frameId": null,
  "boundElements": null,
  "link": null,
  "locked": false
}
```

### 2. 椭圆 (ellipse)

```json
{
  "id": "start-node",
  "type": "ellipse",
  "x": 200, "y": 50,
  "width": 120, "height": 60,
  "strokeColor": "#2f9e44",
  "backgroundColor": "#b2f2bb",
  "fillStyle": "solid",
  "roundness": { "type": 2 }
}
```

### 3. 菱形 (diamond)

用于决策节点、判断分支。

```json
{
  "id": "decision-1",
  "type": "diamond",
  "x": 200, "y": 300,
  "width": 120, "height": 100,
  "strokeColor": "#f08c00",
  "backgroundColor": "#ffec99",
  "fillStyle": "solid",
  "roundness": { "type": 2 }
}
```

### 4. 箭头 (arrow)

```json
{
  "id": "arrow-pg-to-rust",
  "type": "arrow",
  "x": 280, "y": 230,
  "width": 100, "height": 0,
  "points": [[0, 0], [100, 0]],
  "strokeColor": "#1e1e1e",
  "strokeWidth": 2,
  "startBinding": {
    "elementId": "pg-db",
    "focus": 0,
    "gap": 5
  },
  "endBinding": {
    "elementId": "rust-backend",
    "focus": 0,
    "gap": 5
  },
  "startArrowhead": null,
  "endArrowhead": "arrow",
  "roundness": { "type": 2 }
}
```

**箭头关键属性**：
- `points`: 控制箭头的路径 `[[起点x, 起点y], ...中间点, [终点x, 终点y]]`
- `startBinding.elementId` / `endBinding.elementId`: 绑定到形状的 ID
- `endArrowhead`: `"arrow"` 或 `null`
- 曲线箭头：在 points 中加中间拐点，设 `roundness: { type: 2 }`
- 折线箭头：加 `"elbowed": true`

### 5. 文字 (text)

```json
{
  "id": "label-pg",
  "type": "text",
  "x": 100, "y": 215,
  "width": 180, "height": 30,
  "text": "PostgreSQL",
  "fontSize": 20,
  "fontFamily": 1,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "pg-db",
  "originalText": "PostgreSQL",
  "autoResize": true,
  "lineHeight": 1.25
}
```

**文字关键属性**：
- `containerId`: 所属容器的 ID（文字渲染在形状内部时使用）
- `fontFamily`: `1`=手写(Virgil), `2`=无衬线(Helvetica), `3`=等宽(Cascadia)
- 文字为形状内标签时，`boundElements` 需在容器元素中双向引用

### 6. 线条 (line)

```json
{
  "id": "separator-1",
  "type": "line",
  "x": 0, "y": 150,
  "width": 600, "height": 0,
  "points": [[0, 0], [600, 0]],
  "strokeColor": "#868e96",
  "strokeWidth": 1,
  "roundness": { "type": 2 }
}
```

### 7. 自由绘制 (freedraw)

较少用于架构图，此处略。需要时参考 points 数组定义。

---

## 双向引用规则（文字与容器的关系）

当文字元素位于形状**内部**时，需要双向绑定：

```json
// 容器元素中
"boundElements": [
  { "id": "label-pg", "type": "text" }
]

// 文字元素中
"containerId": "pg-db"
```

架构图中推荐用**独立文字元素**而非容器内文字，这样布局更可控。

---

## 颜色参考

| 用途 | 十六进制 | 视觉效果 |
|------|---------|---------|
| 默认边框 | `#1e1e1e` | 黑色 |
| 数据库 | `#a5d8ff` | 浅蓝 |
| 后端服务 | `#ffc9c9` | 浅红 |
| 前端组件 | `#b2f2bb` | 浅绿 |
| 中间件 | `#ffec99` | 浅黄 |
| 外部服务 | `#d0bfff` | 浅紫 |
| 分组框 | `#e9ecef` | 浅灰 |
| 错误/失败 | `#ffc9c9` | 浅红 |

---

## 布局反模式（必须避免）

### 1. 不要在背景分组框上放标签文字

❌ **错误**：文字绑在背景框上 → 居中 → 覆盖内部子元素

✅ **正确**：背景框不放文字，单独在左上角放独立文字元素

```json
// ✅ 分组框 + 独立标签
{ "id": "data-layer", "type": "rectangle", "x": 50, "y": 50,
  "width": 500, "height": 200, "backgroundColor": "#e9ecef" },
{ "id": "data-label", "type": "text", "x": 60, "y": 60,
  "text": "数据层", "fontSize": 18 }
```

### 2. 避免跨区长箭头

跨多个层级的对角线箭头会穿过大量中间元素，导致视觉混乱。改为沿边界走折线，或拆分为多次短箭头。

### 3. 箭头标签适可而止

- 只在标注协议、端口、数据方向时加箭头标签
- 箭头标签 ≤ 12 字
- 密集图中省略箭头标签，用图例代替

---

## 质量控制清单

Agent 编写完架构图后自检：

1. **文字无截断** — 所有标签文字完整显示
2. **无元素重叠** — 分组框完全包含子元素，留有内边距
3. **箭头不穿越无关元素** — 如有穿越，加中间拐点绕行
4. **间距充足** — 元素间 ≥ 40px
5. **字号可读** — 正文 ≥ 16px，标题 ≥ 20px

---

## 写入流程

```
AI 生成 elements[] JSON
  ↓
构建完整 .excalidraw.md（含 frontmatter + appState）
  ↓
write 到 architecture/<图名>.excalidraw.md
  ↓
Obsidian 自动检测文件变化
  ↓
Excalidraw 视图刷新 → 用户可见
```

### 最小可用模板

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://marketplace.obsidian.md/plugins/obsidian-excalidraw-plugin",
  "elements": [
    // AI 生成的 elements 数组
  ],
  "appState": {
    "gridSize": 20,
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
```

---

## 素材库（Library）使用

素材库中有 487 个预设图标，存储在 `.obsidian/plugins/obsidian-excalidraw-plugin/data.json` 的 `library2.libraryItems` 中。

AI 引用素材库元素的流程：
1. 读取 `data.json` → 获取 `libraryItems` 数组
2. 找到需要的素材元素 → 调整其 (x, y) 坐标
3. 将元素并入 `architecture/` 下的 Excalidraw 文件中
4. `files` 字段如有二进制数据需一并迁移

---

*此文档提炼自 Excalidraw 官方插件文档及 `yctimlin/mcp_excalidraw` SKILL.md，适配 Obsidian Excalidraw 插件环境。*
