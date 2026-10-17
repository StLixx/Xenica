# Penpot 画板内 HTML 嵌入试样

范围与验收：[规格](../../../specs/81-penpot-html-embed/spec.md)、[ADR](../../../docs/adr/0021-penpot-html-embed.md)。体验确认前不合并。

基线为 Penpot 2.18.3 `ff7a66f51938b2293260ea27a64e2c4e0833b5e3`，加上现网 #73 的官方多会话兼容补丁（Xenica 固定提交 `1a82a80abd369eaa0983dd91cdd8324cfa383517`）；不能用未打补丁的 frontend 替换，MCP 镜像不变。构建不追踪 develop。

## 可重放实现

`bridge.cljs` 接入 Penpot 原生图形创建、plugin-data 更新、选择、几何修改预览与原型查看。`overlay.js` 是原生 Web Component，独立于 Penpot 编译器，负责 HTML 编辑、iframe 与坐标/交互模式。`apply.py <Penpot源码根目录>` 将这两个源文件和三个调用点装入基线；重复运行不会重复添加。补丁不需要数据库迁移。

在 Infra 的独立构建源执行 apply，再在官方 devenv 中完成 CLJS 格式/lint、`VERSION_TAG=2.18.3-html81-r4 PENPOT_BUILD_OPTIMIZATIONS=simple clojure -M:dev:shadow-cljs release main worker`，使用同一 VERSION_TAG 和 `VERSION=2.18.3 NODE_ENV=production` 调用 `_helpers.js` 的 `compileTemplates()`，运行 `node scripts/build-libs.js`。构建前后固定源码和校验值；运行 `verify_artifact.py <frontend/resources/public>`，不能跳过页面/编译版本一致性。

Dockerfile 上下文包含 public/js、index.html/render.html/rasterizer.html，以及原有已验证 MCP 插件 dist（plugin/）。镜像同时保留旧插件路径并添加新版本路径，避免七天缓存造成旧插件误连。构建源码及日志在 Infra `/opt/penpot-multi-session/html-embed-source`，新任务不得改写原来的 build-source。

## 运行边界

图形为普通矩形，`plugin-data` 命名空间 `shared/xenica-html-embed` 的字符串键 `html` / `state` 保存内容。使用原生变更、权限和持久化；不直接写数据库。刷新后遵循 Penpot 保存状态，不宣称未保存的编辑在断网或强制关闭后已入库。

iframe 仅允许脚本，使用独立不透明来源；内联 HTML/CSS/JS 可运行，父页面 DOM、认证 Cookie、网络请求和表单提交被隔离。首轮以自包含 HTML 为准，第三方网页登录与外部脚本不在保证范围。状态消息只接受对应 iframe 的 window，限制 16,384 个 UTF-16 码元；HTML 限制 262,144 个码元。`window.penpotEmbed.state` 读取保存状态，`window.penpotEmbed.save(JSON可序列化对象)` 保存示例状态。任意 DOM 或第三方编辑器状态不会自动保存。

画布缩放通过外层几何位置和 iframe 文档内部缩放同步，避免缩放 iframe 本身造成鼠标命中丢失；SVG 的几何修改树与 WASM 的变换矩阵分别处理。

原型查看可操作，但不会把只读观看行为写回文件。SVG/PNG 导出保留普通图形，不包含可执行网页；这不是网页截图或静态设计转换工具。首轮面向桌面 Penpot，手机端保留原版编辑器限制。

## 检查

`node --test deploy/penpot/html-embed/test.mjs` 检查坐标和 HTML 文档边界。`browser-smoke.mjs` 在 Infra 浏览器中验证脚本、表单、恢复、隔离和校验；`live-smoke.mjs` 验证实际 Penpot 文件、原生拖动/尺寸、缩放和刷新。浏览器凭据从服务器私有文件加载，不写入仓库。

部署前保存一致备份及原镜像，先在仅本机可见的候选前端验证，再在原固定网址更新前端。回退只恢复前端镜像；不恢复旧数据库覆盖新文件，不触碰其他用户设计。
