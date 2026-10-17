# Desktop 协议与 Rust 适配

记录日期：2026-10-17，目标 MinerU Desktop 0.14.1。只分析用户指定安装包及已有设备凭据；真实上传均为本任务自制公开 PDF。

## 结论与依据

**观察：Desktop 无需个人登录的原因是两层请求凭据由应用准备。** 包内含固定应用 Bearer；首次配置生成设备 client_api_token，后者以明文配置字段保存。其内容由 AES-256-CBC(system UUID + 字面版本 0.1.0) 产生，密钥与 IV 在包内；“字段明文保存”和“字段内容是加密设备标识”同时成立。实际服务端接受二者组合，不能把固定 Bearer 单独当个人 API Token。报告不保存凭据值。

主进程 out/main/index.js SHA256：177146ff2389e8608dc37c5327bd59c0354d8934fce06f0a2e65fdad7073700c。84–90 行生成设备值，169–184 行取得 systeminformation.system().uuid，234–243 行 GET 包装固定应用 Bearer，389–391、485–528、556–560 行确定 ~/MinerU/config.json 的 config JSON 字符串内 state.client_api_token。0.14.1 包仍存在 APP_VERSION=0.1.0 和主进程请求版本 0.12.0，不能用界面版本覆盖历史字面值。

renderer out/renderer/assets/init.loader-t33rQ0l7.js SHA256：b5cb41586581e18cd1c4d94ef47e702e0ed46f7c683f61239057beee7bde9240。

| 原始 UTF-8 字节范围，起含末不含 | 结论                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2701820–2703302                 | /api/v4 包装器；Electron 分支固定应用 Bearer，另附 token、配置 version；网页分支读个人登录 cookie |
| 7546202–7550138                 | 申请上传 URL、PUT、批次查询、重试、反馈、任务持久化适配                                           |
| 7578549–7581000                 | 构建 files 与 data_id，申请批次，写本地任务，上传并启动轮询                                       |

REA 主进程 Evidence：ev_89780dc1fe264b2fda4e5c861f406750f35ec9c8ce59f0daef2fb4381e8ddcc7；summary ev_7b25b181eed7372e2d77b33a64e5899c2cf10c10f19ce04c27eca436cd7c2687。loader 默认分析在 1 GiB 语义 worker 堆耗尽，保留部分结果 ev_45f5be313acf9940afa15bee80791e51c6ece7cd3bea785639f20103868341fb，不能当全量覆盖。为解决该边界，按上表选定不含凭据的惰性代码片段，只加 const 前缀和分号独立解析；来源范围与哈希在脱敏 provenance，REA ev_0ce4a7937eaf2e595d4089755362b8785d6bc995c49f0fd90ac3f02224405325。后者完整覆盖选定片段，但外部依赖仍未解析；所有静态 Evidence 不代表实际执行。

## 已执行协议

基址 https://mineru.org.cn/api/v4。Rust 环境变量 MINERU_PROVIDER_BASE、MINERU_API_BEARER（无 Bearer 前缀）、MINERU_DESKTOP_TOKEN、MINERU_DESKTOP_VERSION=0.14.1。凭据仅存 /etc/mineru-ops/service.env，浏览器只调用自己的鉴权后端。

1. POST /file-urls/batch，JSON：
   {"files":[{"name":"fixture.pdf","data_id":"自有 UUID","page_ranges":""}],"model_version":"vlm","is_ocr":false,"enable_formula":true,"enable_table":true,"language":null,"is_chem":false}。
2. HTTP 200/code 0；data 含 batch_id、file_urls[]、task_ids[]、headers[]。将上传原件、业务 data_id、批次与任务 ID 持久化。
3. PUT file_urls[i] 原始字节，使用 headers[i]，样本为 Content-Type: application/pdf。上传后服务端自动解析，无额外提交。
4. GET /extract-results/batch/{batch_id} 返回 data.extract_result[]。按 data_id 关联，不能依赖数组排序。done 行实际没有 task_id，保留 create.task_ids[]。
5. done 后下载 full_zip_url，安全解包并导入本地结果；只在文件与块都持久化后标为完成。签名 URL 与上游原始错误不写日志或公开响应。

应用 Authorization: Bearer …、token: …、version: 0.14.1 的完整组合已在 Infra 端到端成功。对同一自制任务的只读负向测试：移除设备 token 得 HTTP 200/code -60012；移除应用 Bearer 得 HTTP 401。没有测试或枚举他人任务。

| 自制样本                  | 原件 SHA256                                                      | 结果                                                                                                       |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1 页，正文/公式/表格/图片 | 7b394f7f4288908e9fd090e92ce92b8e757ed70331aa827a3da62c613c7da79a | POST、PUT、poll、ZIP 均成功；ZIP 5cc7bc3feb6dec1c852729132ba9feffe740188f2e5efd2b90adfd5a0d233271，18973 B |
| 3 页连续正文，只提交一次  | 5286e579835aa2dc7dbb12ed9d82e926a1ca59516f4434610b15a3226a85cec5 | 均成功；ZIP 5cf81a0e2455f71a37ca36e78471c96f9f0fa94ff1574ccaa7baebef8c0ad1ce，3 页各一个 text 块           |

第一份 ZIP 含 layout.json、full.md、_\_origin.pdf、__model.json、_\_content_list.json、__content_list_v2.json、images/。layout.json.pdf_info[0].page_size=[595,842]，para_blocks 实际包括 title、text、interline_equation、table、image。第二份实际有 merge_prev 字段，但 preproc_blocks 和 para_blocks 共六处均 false，没有 lines_deleted。**跨页合并 true 与被合并行的实际样本仍未覆盖**。

原始 response、签名 URL、ZIP、完整 REA JSON 在私有研究根 /mnt/HDD/xenica-private/research/mineru-20261017。Git 仅保存自有探针、来源摘要与脱敏运行摘要。

## 持久化与状态

静态观察：Desktop 使用 TypeORM/better-sqlite3，~/MinerU/data/mineru.db（main 2584–2617）。实体包括任务、收藏、标注、负反馈、编辑块、示例。任务保存上游批次/任务/业务 ID、原件、ZIP/解包路径、错误、进度、模型、文件大小与 rank；收藏还保存 task_id、block_position、page_num 和子类型。

主进程 3592–3681 行轮询批次，远端 done 后先改 downloading，再下载解包；3172–3215 行转 waiting-download → downloading → unzipping → unzipped，分别保留下载/解包失败。启动 21407–21412 行恢复轮询和未上传任务。

Rust 设计选择：现有 PostgreSQL 独立业务库保存任务、读位、块、收藏与会话；HDD 保存不可变原件、ZIP 与附件。状态使用 uploading、pending、running、downloading、done、failed；记录上游原状态，未知值保守等待；重启恢复未终结任务。上游 done 与本地导入完成必须区分。ZIP 拒绝绝对路径、路径穿越、符号链接与超限解压，文件下载走鉴权后端。

## 个人 API 区别、边界与轮换

2026-10-17 阅读 [官方精准解析文档](https://mineru.net/apiManage/docs)：个人 API 由管理页创建个人 Bearer，同样使用 v4 申请上传/轮询，返回 Markdown、JSON、图片 ZIP。免登录 Agent 轻量 API 仅 Markdown，不能满足坐标分块 UX。本次未创建个人 Token，未实际测试个人身份。

| 项     | Desktop 观察                                                             | 个人精准 API 文档                                         |
| ------ | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| 凭据   | 固定应用 Bearer + 设备 token，真实验证两者必需                           | 个人管理页生成 Bearer                                     |
| 归属   | 当前设备和桌面通道                                                       | 申请者账号                                                |
| 地址   | 本包 mineru.org.cn/api/v4                                                | 官方示例 mineru.net/api/v4                                |
| 模型   | 默认 vlm，另有 pipeline                                                  | PDF 支持两者                                              |
| 上传   | 额外返回 task_ids、headers                                               | 文档保证 batch_id、file_urls                              |
| 限制   | 客户端 PDF 200 MiB、图片 10 MiB、每批 20；超 200 页引导选页              | 服务端文档 200 MB、200 页；批次数值同页有差异，不扩大采用 |
| 额度   | 桌面设置现场 5000 文件/1000 优先页；包内另有历史 2000 文案，不能当现行值 | 文档每日 1000 优先页，超出降低优先级                      |
| 有效期 | 固定 JWT 自报 exp 在 2030 年附近，不能证明服务端长期有效                 | 当前个人页面显示 90 天，待申请后验证                      |

采用已验证 Desktop 通道，无需先申请个人 Token。返回 401 或 -60012 时保留原件，管理员从已安装 Desktop 私下捕获凭据、更新服务端环境并重启；先用自制公开 PDF 验证后恢复任务。个人通道是可选替换，不能删掉设备 header 就宣称兼容。切换前须用个人 Token 实际重测字段和额度。凭据不进入 Git、前端、公开备份清单或会话输出。
