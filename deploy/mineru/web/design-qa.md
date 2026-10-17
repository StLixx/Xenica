# 界面核验

2026-10-17，Infra headless Chromium；未操作用户电脑界面。

## 视觉目标与资源

目标为用户提供的 MinerU Desktop 对照阅读及参数设置图：浅灰文件栏、白色主区、双栏分隔、原文框、Markdown/JSON 标签及按块工具。1692×1504 桌面与 390×844 窄屏截图已亲眼检查。

官方标志来自已安装制品 out/renderer/assets/MinerU_logo-D6SRaHir.svg，7812 bytes，SHA256 79b6b5c6dfd5e8c8bcc9319a7d272d18b9925276b49d7665e392255c5b2a8736，与 ASAR header integrity 一致。私有原件不入 Git；构建前置入 public/brand/mineru.svg，输出包包含该资源。

## 已测

- 使用自己制作的 PDF 经真实 API 返回的 layout、图片、原文作为独立测试输入；测试层模拟自己的 HTTP API，生产应用无内置文档。
- 8 个原坐标框、图片/表格/公式呈现，PDF→结果及结果→PDF 点击高亮、JSON 切换。
- VLM 公式/表格开关强制开启且禁用，上传参数弹窗、设置。
- 窄屏切换原文/结果，无横向溢出；初始和视口变窄时文件栏收起。
- 3 页实际 PDF 自然滚动不吸附页首；离开 overscan 后首 canvas 宽高归零，重返重绘。浏览器 console/pageerror 均无错误。
- JSON 只有展开的页才序列化到 DOM；正文 content-visibility 与 memo；完成文档停止详情轮询。28MB 结果首次下载与 JSON 解析成本仍存在，不宣称已做到流式分页接收。
- 完整构建与格式化通过。

截图：任务私有 output/playwright/mineru-desktop.png、mineru-settings.png、mineru-upload.png、mineru-mobile.png、mineru-mobile-source.png。

## 边界

当前此记录只证明独立前端行为；实际 Rust/PG 上传到任务完成、收藏/阅读状态持久化与部署身份，由整体验收记录补证。没有把模拟接口的成功登记为生产全链路成功。跨页连线依合成关系测试，真实 API merge_prev=true 仍未观察到。

final result: passed（前端独立界面与交互范围）

## 正式 HTTPS 集成复核

已在 https://mineru.truebigsand.top 使用真实 Rust/PG/API 完成 18 项检查，并在最终修复后亲眼检查桌面与390px窄屏截图。倍率1.0与界面100%的转换、立即刷新、收藏精确回源、窄屏导航均已回归。父 Agent 同时复核了最终桌面与窄屏解析结果截图，原文铺宽、坐标框、公式/表格/图像及选中工具栏正常。最初的纯前端模拟结果不再被用作生产全链路证据；早期遗漏和修复仍保留在 frontend-live-checks.json。

final result: passed
