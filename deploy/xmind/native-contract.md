# XMind 原生宿主契约

2026-10-17，对现版发布物做四文件静态调查；发布文件及完整 Evidence 仅保留于 Infra 私有目录，不进入 Git。

- REA 6.5.0 Evidence：`ev_28e1f41968229e2c8c3b857ee9dc5d4bbab4d620138a17b9c7643336828e5c8f`。
- 私有证据：`/var/lib/rea-ops/xmind-native-contract-evidence.json`；来源目录：`/opt/xenica-workspace/research/xmind-20261017`。
- 精确来源：`mjs.chunk.XnVMm1_0.js`、`snowmonster-ext.chunk.Cm6xzzpD.js`、`xmind.chunk.CiVbhhD5.js`、`xap-image.chunk.DdKUvsnD.js`。读取 1,736,002 字节，四文件解析成功。另 1,111 文件只登记身份，未做源码分析。
- 图关系覆盖不完整；语义图有每文件 2,500／总计 10,000 节点预算。静态观察不代表浏览器已执行；交互、图片和文件往返由实际部署验收另行证明。

## 已观察到的接口

| 能力 | 发布物实际契约 |
| --- | --- |
| 核心模块 | `i` 为核心 API，`a` 为 dataKit，`c(symbol)` 为编辑器，`l(symbol)` 为内核运行实例，`o` 含默认主题 ID |
| 初始化 | `i.globalConfigSetup({assetsBaseURL,toAssetsUrl})`；`native.changeFile({id,stage})`；`native.setContainer(container)`；`editor.changeLanguage('zh-CN')` |
| JSON | `i.DKdeserializeDocument(content,metadata,cache?)`；`i.DKserializeDocument(document)` 返回 `{content,metadata,resources:[path]}` |
| 宿主存储 | `stage.getDocument/setDocument/take/add/delete/toUrl`；资源读写使用不含 `xap:` 的路径及 ArrayBuffer |
| 图片 | `editor.createXapUrlByArrayBuffer(bytes,ext)` 生成 `xap:resources/<SHA256><ext>`；`mutate:insertImage` 的 `inputValue` 是该 URL |
| 选点 | `mutate:selectTopics` 的 `payload` 为 `{topics:[id],centerOn:false}` |
| 文件 | `i.documentKit.archiveXMindDocument(doc,textWriter,resourceWriter)` 和 `unarchiveXMindDocument(textReader,resourceReader)`；回调首参含 `path` |
| 格式转换 | `xmind.chunk` 的 `t(arrayBuffer)` 使用官方转换器生成规范归档，再调用原生反序列化 |
| 状态 | 编辑器暴露 `document/sheets/selection/actionStates/activeSheetId/currentZoomScale/activeSheetViewerInited` ref，以及 `canUndo()/canRedo()` |

内存图片属性为 `imageSource`，JSON 对应 `topic.image.src`。JSON children 按 `attached/detached/summary/callout` 分组。序列化器可能为样式生成新 ID，初载脏检查按文档对象身份判断，不能仅比较两次序列化字符串。

## 独立宿主模块

`web/native.js` 导出异步 `createBlankSnapshot(title)` 和 `openNative({container,snapshot,id,onChange,onState})`。后者返回 `{editor,native,snapshot,run,select,addImage,exportFile,importFile,dispose}`。

快照：`{schema:1,native:{content:[sheet],metadata:{}},resources:{path:base64},view:{activeSheetId}}`。快照同步生成；二进制与 base64 同时缓存，初载不触发写回。会话内保留未引用资源，使删除图片后撤销仍可恢复；导出仅打包原生序列化器引用的资源。

`run(name,inputValue?,payload?)` 按 `mutate:/mutateEditor:/mutateProperty:` 转发到对应原生方法，其余转发 `executeAction`。`onState` 提供 `{ready,selection,actionStates,activeSheetId,zoomScale,canUndo,canRedo,sheets}`。资源加载、节点编辑、布局、拖拽和历史均由原生内核负责。

尚待运行验证：浏览器真实事件、中文组合输入、拖拽落点、图片删除撤销与刷新、原生文件含图往返、异常/加密文件。未知功能不因静态字符串存在就宣称完成。不修改官方账号、付费或鉴权逻辑，不伪造许可。

现版云编辑器运行对照显示，选根节点或分支时会出现蓝色加号。独立宿主保留内核默认的加号与引导设置；早期静态 workbook-manager 中关闭移动引导的调用，不能代表当前云页面最终运行状态。运行证据优先于旧外壳映射推断。

剪贴板宿主必须注入 `globalConfigSetup.clipboard.read/write`：默认读取返回 null，默认写入无操作。适配标准浏览器 Clipboard API 的文字、HTML 和图片；结构及图片字节由原生 IndexedDB 缓存关联。复制、剪切、粘贴的 `run` 返回 Promise，调用方须等待完成；权限拒绝由浏览器决定并向调用方报告，未授予默认权限。

选择状态：`editor.selection.value` 是 `{type,modelIds}` 摘要；宿主 `onState.selection` 提供 `activeSheetViewerState.value.selection` 原始 `{kind,topics}`，摘要另置 `selectionInfo`。文件菜单调用剪贴板动作前恢复 viewer 焦点，再等待动作状态更新；复制前检查所选片段引用的资源。未生成新片段、资源缺失和各阶段超时明确失败，不能将系统旧内容视为本次复制成功。
