# MinerU Desktop 对照阅读逆向

2026-10-17；目标 Desktop 0.14.1。本页记录对照阅读，接口与部署见同目录其他记录。流程：确认制品 → 有界 REA 分析 → 源范围定位 → 样本结构核对 → 标注未知 → 独立实现。未执行原应用引导代码。

## 证据与覆盖

- REA CLI 6.5.0 Evidence：ev_29b73fea8064fa829e06d87a0ce5e1e1ee323f36087b52fec4ccf3371071924b。操作 analyze_javascript_application；选择 5 个对照阅读、收藏、任务导出模块，总 semantic node 上限 16000、每文件 5000。完整 Evidence 私有保留为 rea-block-ux.json。
- [静态证据索引](evidence/block-ux-static.json) 保存 Evidence SHA256、选源范围、各文件及片段摘要、字符范围和 UTF-8 字节范围（零基、右端不含）。以下 S: 引用对应 sources[].id。
- init.loader-t33rQ0l7.js 包含真正的块适配及 PDF/Markdown 组件；SHA256 b5cb41586581e18cd1c4d94ef47e702e0ed46f7c683f61239057beee7bde9240。该文件是在上述 5 模块分析后加入，不能冒称由该 Evidence 覆盖；本页对其结论来自已哈希、按范围保留的惰性源码检查。
- 补充 loader REA Evidence：ev_45f5be313acf9940afa15bee80791e51c6ece7cd3bea785639f20103868341fb。该次默认 1GB heap 在语义阶段耗尽，图不完整；只能作为有边界的静态证据，不能宣称完整调用图。
- 所读文件是已安装 ASAR 经 integrity 核对抽取的子集，非完整包。REA 声明未选择文件的关系未知、图覆盖不完整、静态导入不证明运行。“搜不到”不等于没有功能。
- [私人结果结构摘要](evidence/block-ux-fixture-summary.json) 仅保留类型、数量、坐标尺度与摘要，不含原书正文、图像或文件名。它是一次历史解析，不证明当前服务准确率。
- 本次没有连接原应用 Electron CDP；曾观察系统设置并尝试关闭设置，随后用户停止桌面操作并明确要求“不使用全局 computer use”。未执行对照页的关键操作，后续只用 Infra 独立环境验证。附件是用户给出的运行画面，支持布局与可见联动状态；其他交互以下均为静态观察，不是实际点击证明。

## 结论账本

| 问题               | 观察与结论                                                                                                                                                                              | 依据                                                                         | 状态               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------ |
| 分割来源           | 解析器已返回每页 para_blocks、类型、bbox、index 和行/跨度；Desktop 做适配和渲染。无证据表明截图是用户手工切段                                                                           | S:loader-normalize-old、loader-normalize-vlm；结构样本                       | 已回答，静态/样本  |
| JSON/Markdown 关系 | layout.json 为版面几何原数据；content_list 是较扁的导出；block_list.json 是 Desktop 派生缓存 {pdfData,mergeConnections}。Markdown 逐块渲染，并非仅打开 full.md；JSON 页读原 layout.json | S:loader-desktop-load、loader-markdown-pages、web-preview-load、batch-export | 已回答，静态       |
| 坐标尺度           | bbox=[x0,y0,x1,y1] 与同页 page_size=[w,h] 配对；样本首页 [373.5,500.0625]，不是统一 0–1000                                                                                              | S:loader-normalize-old、loader-pdf-events-merge、web-preview-load；样本      | 已回答             |
| 阅读顺序           | 按源 index 排序，保留小数；旧适配图表子块也稳定排序。页眉、旁注、页脚有前后偏移，新 VLM 路径带 is_discarded                                                                             | S:loader-normalize-old、loader-normalize-vlm                                 | 已回答，静态       |
| 图表题注           | 旧适配由 zbt 拆 caption/footnote，带 parent_id 和各自 bbox；图片在题注前，表标题在表前。新 VLM 直接展开 image_body/table_body 等子块                                                    | S:loader-flatten-merge、loader-normalize-vlm                                 | 已回答，静态       |
| 公式与表           | 行内公式用单美元分隔，独立公式用双美元分隔。旧适配无公式内容但有裁图时退图片。表格优先 LaTeX 或 HTML，保留裁图路径                                                                      | S:loader-normalize-old、loader-normalize-vlm                                 | 已回答，静态       |
| 虚线“合并”         | lines_deleted 是续块信号；Vbt 向前找同类型块（table/table_body 等价），续块复用其 id，形成 {id,blocks:[block_position],type:merge}。SVG 绘虚线、端点和标签                              | S:loader-flatten-merge、loader-pdf-events-merge                              | 已回答，静态/样本  |
| 双向定位           | PDF SVG 与 Markdown DOM 共用 data-content-id。PDF click/hover 发事件，右侧找所有同 id；右侧反查 PDF 同 id，先定位页再定位框。续块同 id 可整体高亮                                       | S:loader-pdf-shape、loader-pdf-events-merge、loader-bidirectional            | 已回答，静态       |
| 滚动联动           | 找到选择驱动的定位、页码跳转、懒加载重试；未证明两个滚动条持续按比例锁定。复刻增加连续联动应列为设计选择                                                                                | S:loader-bidirectional、loader-pdf-viewer                                    | 部分回答           |
| 复制/收藏          | 工具栏按文字、公式、表、图片分派。收藏保存任务、类型、内容快照、block_position、页码；卡片可打开源任务并带位置跳转                                                                      | S:loader-block-toolbar、loader-collections、collection-view                  | 已回答，静态       |
| 编辑与导出         | 按来源位置改缓存；桌面同时调用本地保存与远端编辑（过期另处理）。Markdown 从当前块重建；JSON 导出原 layout，不能承诺编辑后总一致                                                         | S:loader-state、loader-markdown-pages、batch-export                          | 已回答，静态       |
| 检测算法           | 包内只见输出适配/渲染，没有服务端检测、排序、合并模型，不能据此逆推出算法或精度                                                                                                         | 制品边界                                                                     | 未知，依赖远端 API |

## 数据到画面

1. 历史结果有 340 页；content_list 3051 项：2663 text、176 image、157 equation、55 table。content_list 不含 bbox，不能单凭它画准确框。
2. Desktop 按模型选择 Office、旧 MinerU、新 VLM 适配。样本 block_list 有 3897 项，232 个父子链接、193 个 lines_deleted，156 合并组（116 跨页）。618 空类型项无 bbox，不应生成正文框。
3. zbt 赋来源位置：页索引与适配后原块索引组成 page-block；题注再附 _img_caption、_table_footnote 等后缀。id 为关联渲染的随机 UUID v4；block_position 是编辑、收藏和定位的另一键，不能混为一个概念。
4. Vbt 通常改共享 id 与合并关系，不再次拼正文；跨页表脚注另有内容/框迁移分支。上游已合并内容时，再拼会重复。
5. PDF.js 按页宽显示，再盖 SVG。源码含 DPI、viewport scale、旋转适配；Web 图片预览会将 bbox 从 page_size 按 x/y 比例缩放至图片尺寸。复刻用 bbox/page_size × 当前页尺寸，避免混淆图片像素与 PDF 坐标。
6. 右侧逐页懒呈现，外层带内容 id；同一逻辑正文可对应多处物理矩形。合并虚线将已有来源关系可视化，不是额外识别算法。
7. 来源跳转先找页，等注释层渲染再找块、居中和高亮。大文档不应等所有 canvas 完成才可用。

## Rust/PG 与前端契约

以下为独立复刻设计，不声称是 Desktop 原 HTTP。原始下载不可变，适配可重算，阅读状态和收藏进入自己的数据库。

GET /api/documents/:id 保留 layout、content_list、markdown，提供 blocks 与 reading。API 页号全部零基，界面加一。

| 字段                             | 约束                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------ |
| id                               | 每个物理来源块稳定唯一，以文档/来源位置派生，重算不漂移                        |
| logical_id                       | 同正文跨框关联键；默认等于 id，续块共享                                        |
| source_position                  | 模型版本、页、完整嵌套路径；兼容 Desktop 位置，不是屏幕序号                    |
| type / source_type               | 归一类型和原类型分开保留；包括文字、标题、图、题注、公式、表、脚注、代码、未知 |
| page / page_width / page_height  | 原始零基页和相同坐标系页面尺寸                                                 |
| bbox                             | 原始框或 null；无框只显示结果，禁止编造坐标                                    |
| index / parent_id                | 原阅读顺序及题注关系；顺序允许小数                                             |
| text / html / latex / image_path | 正文、表 HTML、公式、裁图引用；HTML 清洗，图片经受控资源路由                   |
| merged_from                      | 同正文全部物理来源 id；不合成跨页大 bbox                                       |
| discarded                        | 页眉/页脚/丢弃项单独标记，不冒充正文                                           |
| reading                          | {page,selected_id,zoom}，绑定文档拥有者                                        |

合成例：第 0 页 p0-b2 有正文，第 1 页 p1-b0 是空续块，两者 logical_id=p0-b2，各保留本页 bbox，merged_from=[p0-b2,p1-b0]。选任一框高亮两处并定位非空正文。空续块不等于用户删除，无条件串接会重复。

当前真实 API 对自制合成 PDF 返回的 [结构摘要](evidence/block-ux-current-api-summary.json) 显示 layout 版本 3.4.4，页面 [595,842]；文字已有 merge_prev 字段。表格父 bbox 不包含上方 caption 的 bbox，进一步证明子块必须分别保留。该单页样本不证明 merge_prev 的跨页语义，不可只按字段名无条件合并。

优先完整 layout；仅 content_list 时明确“无来源框”降级。未知类型保留原值并报告。旧模型与 VLM 2.5+ 的命名/展开层次不同，需分别适配。

## 自检与未知

复刻需用合成或公开样本验证：文字、行内/独立公式、图表题注、同页/跨页续块、缩放/不同页尺寸、双向选择、无框/无图/空块、大文档懒加载、收藏回源、刷新后的阅读状态和收藏。自己的实测与原应用观察分开登记。

原应用连续滚动联动、旋转后所有边界精度、复杂页面虚线避障、跨页表脚注全分支、最新模型兼容仍需补证。接口鉴权、额度、任务生命周期与部署验证由本调查其他章节负责。

## 完整制品身份补证

官方 Windows 安装包提取出的 app.asar 与 MinerU.exe 已与本机安装原件逐字节摘要相同，原始制品均已私有保留，见 [制品身份](evidence/artifact-identity.json)。完整 ASAR 的有界 REA 生产者输出保留为 ev_611031768f7fcb1d8700c62cf00b464ab8ff1d7f384c599c0a8a73800da465cc，完整记录约 618 MB；内联 summary 读取遇到消费者 heap headroom 限制，未重跑生产者、未裁剪 Evidence 冒充有效记录。结论继续引用较小的匹配成员分析，限制见 [原始制品 REA 元数据](evidence/original-asar-rea.json)。
