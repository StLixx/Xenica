# Syntax Highlighting & Diff Theming — Research Notes

> 调研范围：IDE / 编辑器（VS Code、JetBrains 全家、Sublime、Zed、Neovim、Emacs、Atom、Xcode）
> 与终端 / 版本管理（Git）的"事实标准"配色体系。
> 一手源：[TextMate manual](https://macromates.com/manual/en/language_grammars) · [LSP 3.17 semanticTokens](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens) · [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color) · [VS Code semantic highlighting docs](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide) · [Monokai / One Dark / Tokyo Night / Solarized / Catppuccin / Gruvbox] 仓库 `theme.json`

---

## 1. 唯一公认的语法命名标准：TextMate grammar scopes

**起源**：2005 年 MacroMates（TextMate 编辑器作者）定义；后被 Sublime、Atom、VS Code、JetBrains、Zed、Neovim、Emacs 全家继承。**这是事实上的跨编辑器语法 token 命名标准**。

**作用域结构**：`.` 分层，前缀表示大致分类：

```
comment.line.double-slash  ← 来源/状态修饰 + 类别 + 子类
keyword.control.flow        ← keyword → control → flow
string.quoted.double        ← string → quoted → double
entity.name.function        ← entity → name → function
```

**类别顶级分类（每个主题都会区分这几类）**：

| Scope prefix | 含义 | 例 scope |
|---|---|---|
| `comment.*` | 注释 | `comment.line`, `comment.block.documentation` |
| `string.*` | 字符串字面量 | `string.quoted.single`, `string.regexp` |
| `constant.numeric.*` | 数字 | `constant.numeric.integer`, `constant.numeric.float` |
| `constant.language.*` | 内置常量（true/null/this） | `constant.language.null`, `constant.language.boolean.true` |
| `keyword.*` | 关键字 | `keyword.control.flow`, `keyword.operator.logical` |
| `storage.*` | 存储修饰符 | `storage.type`, `storage.modifier` |
| `variable.*` | 变量 | `variable.parameter`, `variable.other.readwrite` |
| `entity.name.*` | 命名实体 | `entity.name.function`, `entity.name.class`, `entity.name.tag` |
| `entity.other.*` | 其他 | `entity.other.attribute-name` |
| `markup.*` | 标记语言（HTML/MD） | `markup.heading`, `markup.bold`, `markup.italic`, `markup.inline.raw`, `markup.underline.link` |
| `meta.*` | 元/结构 | `meta.function`, `meta.class`, `meta.tag` |
| `support.*` | 内置支持 | `support.function.builtin`, `support.type.sys-types` |
| `invalid.*` | 非法/警告 | `invalid.illegal`, `invalid.deprecated` |
| `punctuation.*` | 标点 | `punctuation.definition.string` |

**重要**：scope 是"分类标签"，**不规定色值**——每个主题对每个 scope 自己挑色。

---

## 2. LSP Semantic Tokens：机器可读的 token 枚举（2019 起）

LSP 3.16 引入，VS Code 在 1.44 (2020) 起把它作为 TextMate 上叠加的一层。**这套 token type 和 modifier 是规范定义，不允许扩展**。

**Token types（22 个，规范固定）**：

```
namespace type class enum interface struct typeParameter
parameter variable property enumMember event function method macro
keyword modifier comment string number regexp operator decorator
```

**Token modifiers（11 个，可叠加）**：

```
declaration definition readonly static deprecated
abstract async modification documentation defaultLibrary
```

**协议**：`textDocument/semanticTokens/full` 拿到的就是 `{ line, startChar, length, tokenType, tokenModifiers[] }` 数组，渲染端按类型映射到 token color name（`tokenColorCustomizations`）。

**与 TextMate 的关系**：Semantic tokens 覆盖范围更窄（聚焦 identifier），但是更准确（类型由语言服务器提供），常作为 TextMate 的补充层使用，而不是替代。

---

## 3. Git 红/绿 diff 约定（事实标准，1970s 起源）

终端时代留下来的红 = 删 / 绿 = 增 约定，**几乎所有现代 IDE 都保留**。

**VS Code 把它规范化为 workbench color tokens**：

```
gitDecoration.addedResourceForeground       新增文件/文件名
gitDecoration.modifiedResourceForeground    修改过
gitDecoration.deletedResourceForeground     已删
gitDecoration.untrackedResourceForeground   未跟踪
gitDecoration.conflictingResourceForeground 冲突
gitDecoration.ignoredResourceForeground     忽略
gitDecoration.submoduleResourceForeground   子模块

diffEditor.insertedTextBackground           插入文本背景
diffEditor.removedTextBackground            删除文本背景
diffEditor.insertedTextBorder               插入文本左边框
diffEditor.removedTextBorder                删除文本左边框
diffEditor.diagonalFill                     未改动的填充

editorGutter.addedBackground                gutter 加号背景
editorGutter.modifiedBackground             gutter 蓝点
editorGutter.deletedBackground              gutter 三角
```

**JetBrains 走同样语义但 token 名不同**：`Vcs.FileAdded`、`Vcs.FileModified`、`Vcs.FileDeleted`，`EditorDiff.*`。

**Solarized / Monokai / One Dark 这套传统语义色**：

| 语义 | Solarized | Monokai | One Dark |
|---|---|---|---|
| 删除/警告 | `#d30102` red | `#f92672` pink | `#e06c75` red |
| 新增/成功 | `#859900` green | `#a6e22e` green | `#98c379` green |
| 关键字 | `#6c71c4` violet | `#f92672` pink | `#c678dd` purple |
| 函数 | `#268bd2` blue | `#a6e22e` green | `#61afef` blue |
| 类型 | `#b58900` yellow | `#66d9ef` cyan | `#e5c07b` yellow |
| 字符串 | `#2aa198` cyan | `#e6db74` yellow | `#98c379` green |
| 数字 | `#cb4b16` orange | `#ae81ff` purple | `#d19a66` orange |
| 注释 | `#93a1a1` base1 | `#75715e` muted | `#5c6370` grey |
| 链接 | `#268bd2` blue | `#66d9ef` cyan | `#61afef` blue |

**通用通行约定**（跨主题都有）：

| 角色 | 通行色 | 备注 |
|---|---|---|
| 删除 / 警告 | 红/粉 | `red/pink` |
| 新增 / 成功 | 绿 | `green` |
| 关键字 (control) | 紫/红/粉 | 主题间差异最大 |
| 函数名 | 蓝/青/黄 | 主题间差异最大 |
| 类型 / 类名 | 黄/绿/橙 | 主题间差异最大 |
| 注释 | 灰 | 几乎是基线 |
| 数字 | 橙/紫 | 主题间差异 |
| 当前行 | 灰提亮 5–10% | 几乎所有主题 |
| 选区 | 蓝色 10–15% alpha | 几乎所有主题 |
| 链接 | 蓝 | 通用 web 约定 |

---

## 4. 各主题对色系的具体选择（按家族归类）

| 家族 | 代表主题 | bg | fg | accent | 调性 |
|---|---|---|---|---|---|
| Solarized | Solarized Dark | `#002b36` | `#93a1a1` | `#268bd2` | 16 色精准平衡，蓝底 |
| Monokai | Monokai / Monokai Pro | `#272822` | `#f8f8f2` | `#f92672` | 高彩度，紫红 accent |
| One Dark | Atom One Dark | `#282c34` | `#abb2bf` | `#61afef` | 中性灰底，蓝 accent |
| Tokyo Night | Tokyo Night | `#1a1b26` | `#a9b1d6` | `#7aa2f7` | 冷色蓝调，最接近 Xenica bg |
| Catppuccin | Mocha / Latte | `#1e1e2e` | `#cdd6f4` | `#fab387` peach | 暖底色，赤陶 accent 跟 Claude 接近 |
| Gruvbox | Gruvbox Dark | `#282828` | `#ebdbb2` | `#fabd2f` | 暖底色 |
| Material | Material Theme | `#263238` | `#eeffff` | `#82aaff` | 蓝灰 |

**结论**：色值没有标准，但**类别数量**和**亮度对比模式**是稳定的——每个主题基本都会区分：
- bg / surface-1 / surface-2（三层）
- text-primary / text-secondary / text-muted（三层）
- accent-1 / accent-2（两个高彩度色）
- success / warning / error / info（语义四色）

---

## 5. 对 Xenica 节点型笔记语境的建议

Xenica 是节点型笔记（"织念"），它的"语法高亮"不是源码，而是**节点内容里的 token**——双向链接、标签、@mention、嵌入代码块、内联公式、引用块等。我会用如下映射：

| Xenica token | 对应 IDE 语义 | 颜色建议 |
|---|---|---|
| `[[双向链接]]` | `markup.underline.link` | 赤陶 accent `#D97757` + 下划线 |
| `#tag` | `entity.name.tag` | 比链接色弱一档，灰偏暖 |
| `@mention` | `constant.language`（内置特殊） | 灯油蓝灰 `#7B8AA1`（冷色补色，克制） |
| 嵌入代码块 keyword | `keyword.control.flow` | One Dark 紫 `#c678dd` |
| 嵌入代码块 string | `string.quoted.double` | One Dark 黄绿 `#98c379` |
| 嵌入代码块 number | `constant.numeric` | One Dark 橙 `#d19a66` |
| 嵌入代码块 comment | `comment.line` | 灰绿 `#75715e` |
| 引用块 / quote | `markup.quote` | 左 3px border-500 + 文字 text-500 |
| 标题 H1/H2/H3 | `markup.heading` | text-900 + 字号分级 |
| 内联公式 | `markup.inline.raw` | 浅赤陶底色块 |

**Diff / 节点状态色**（用 Git decoration 语义）：

| 节点状态 | 语义 | 颜色 | 行为 |
|---|---|---|---|
| 新建（未读） | added | `#8ca06f` success-500 | 左 2px 绿色带 |
| 已编辑未保存 | modified | `#D97757` accent | 赤陶 indicator + halo |
| 冲突 / 损坏 | conflicting | `#ef4444` error-500 | 红点 + 删除线 |
| 已归档 | deleted | `text-400` + 删除线 | muted 灰 |
| 当前选中 | selected | 蓝色 alpha 12% 背景 | bg tint |

**这套配色逻辑可写进 Xenica 的 Design System 规范**，作为节点视图的 token 系统。