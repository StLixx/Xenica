# Penpot 画板内 HTML 嵌入试样

范围与验收：[规格](../../../specs/81-penpot-html-embed/spec.md)、[ADR](../../../docs/adr/0021-penpot-html-embed.md)。当前仍待用户实际体验确认，不合并。

## 当前体验

顶部原生「更多工具 → 嵌入 HTML」，可将入口固定到工具栏；选中 Board 后，右侧原生属性面板提供「在此 Board 插入 HTML」。选中 HTML 或包含 HTML 的 Board 后，可进入交互、编辑源码、适配 Board；HTML 子块也可选择所属 Board。双击进入网页，Esc 返回画布；原生画布/手柄操作退出交互。底部独立工具条及块上的悬浮按钮已移除。桌面保持单行，窄窗口内原生工具栏换行，菜单向画布内展开。

插入时明确保存目标 Board，不依赖打开对话框前的旧选择或仅按位置猜测父级。Board 保留标题拖动、边框双向缩放；HTML 子块也可独立调整。适配操作对齐四角并设置双向伸缩约束，HTML 层继承祖先 Board 裁剪，使用原生可撤销文件变更。已有路径从四角恢复显示几何，无需转换或删除用户内容。

HTML 的 iframe 保留逻辑尺寸，通过外部矩阵呈现画布缩放。修改 HTML 块尺寸会改变网页视口；缩放整个画布不会改变 iframe 的 `innerWidth`、媒体查询或 CSS 布局宽度。自动浏览器对变换 iframe 的 locator 坐标可能未缩放，因此点击验证使用元素局部矩形经 iframe 可见比例换算后的真实鼠标坐标，不用脚本 click 绕过命中。

## 可重放实现

基线为 Penpot 2.18.3 `ff7a66f51938b2293260ea27a64e2c4e0833b5e3`，保留 #73 官方多会话补丁（Xenica 固定提交 `1a82a80abd369eaa0983dd91cdd8324cfa383517`），MCP 镜像不变。不追踪整个 develop。

`bridge.cljs` 接入原生图形、plugin-data、几何预览与原型；`overlay.js` 管理隔离 iframe 和源码对话框；`controls.cljs/.scss` 使用 Penpot 原生按钮、菜单和属性面板；`toolbar.scss` 只补充窄窗口换行。`apply.py <Penpot源码根目录>` 可重复装入固定构建源，包含 SVG/WASM 两个调用点、原型层、原生工具栏和设计属性面板。原构建源 build-source 不改，独立源在 Infra `/opt/penpot-multi-session/html-embed-source`。

在官方 devenv 执行 CLJS 格式/lint；以同一 `VERSION_TAG=2.18.3-html81-r10 VERSION=2.18.3 NODE_ENV=production` 编译 `main worker`、调用 `_helpers.js` 的 `compileStyles()` 与 `compileTemplates()`、运行 `node scripts/build-libs.js`。workerpool 不兼容父进程的 `--input-type` 标志，使用保存的模块或 `node -e 'import(...).then(...)'`。`verify_artifact.py` 校验页面、编译版本与运行资源。

Dockerfile 上下文须包含 public/js、public/css、index.html/render.html/rasterizer.html 和原有已验证 MCP 插件 dist（plugin/）。保留旧插件地址并增加新版本地址，避免缓存误连。源码校验值与确切镜像见 evidence.json。部署命令 `python3 deploy.py <候选镜像ID> <预期当前镜像ID>`，比较运行身份和候选页面版本后才切换，失败只回退 frontend。

## 持久化与边界

普通图形的 `plugin-data` 命名空间 `shared/xenica-html-embed` 保存字符串键 `html` / `state`；经过原生变更、权限和持久化，不直接写数据库。HTML 限制 262,144 个 UTF-16 码元，状态限制 16,384 个码元。`window.penpotEmbed.state` 读取示例状态，`window.penpotEmbed.save(JSON可序列化对象)` 保存。任意 DOM 或第三方编辑器不会自动序列化。刷新测试等待实际变更进入保存队列，再检查保存并重开。

iframe 使用不透明来源，仅允许脚本；父页面 DOM、认证 Cookie、网络请求与表单提交隔离。自包含 HTML/CSS/JS 是首轮保证；外部登录、脚本加载和任意 URL 不在保证范围。原型可交互但不写回只读文件。SVG/PNG 导出保留普通图形，不导出可执行网页；手机编辑沿用原版限制。

## 当前检查与恢复

`test.mjs` 验证坐标、裁剪与文档隔离。`browser-smoke.mjs` 在隔离页面验证输入、点击、恢复、空内容及 8%–200% 的逻辑视口/媒体查询与实际命中。`native-ui-smoke.mjs` 只允许私有登记的独立回归副本，覆盖原生菜单/固定入口、两个 Board、Board 与 HTML 的真实手柄操作、8% 画布缩放、输入保存/重开、桌面/窄屏和只读原型。`feedback-smoke.mjs` 在原体验文件做不改设计内容的连续滚轮、Space 平移、双击/Esc 和刷新；同时测量真实 iframe 逻辑视口。r7 的 live/board/doubleclick 等旧回归脚本仅保留历史取证，当前入口以 native-ui 为准。

部署前执行仓库版本 `deploy/penpot/backup.py`，不能直接假定服务器旧脚本已更新：旧版本仍按已废弃的 PG 源名 shared 查找，会在当前 panel-main 配置下失败。2026-10-17 本轮已核验实际 backend 端点、主库身份与独立备份，并将仓库已有的 backup.py/routing.py 安装回运维目录；定时计划和数据库端点不变。

归档包含确切新旧前端。须进入 core 托管同步源 `/var/lib/pg-ops/encrypted/penpot-artifacts/`，避免既有 `rclone sync --delete-after` 清掉仅上传的远端副本。发布归档与 PG 云同步共用 cloud.lock，避免两个上传者对同一大文件产生 HTTP 409；不能把重试失败当成校验通过。恢复先验证 SHA256SUMS 后 docker load，只按回执恢复 frontend 环境并重建 frontend；不还原旧数据库覆盖新设计。
