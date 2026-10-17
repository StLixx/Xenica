# Rust 后端实现与验证

实现位置：deploy/mineru/server（独立 Cargo workspace，Rust 2024），迁移仅新增于 deploy/mineru/migrations。构建、测试均在 infra-server，经 infra-dev-run 共用 4 CPU/6 GiB slice；target 位于 /mnt/HDD/xenica-private/build/mineru-target。没有在 Windows 安装依赖、构建或启动业务。

## 数据与权限

复用 panel-main PostgreSQL 18.6，系统 ID 7689904531301453863。仅创建 mineru 独立库、NOLOGIN mineru_app_owner 与受限 mineru_app；角色连接上限20，SQLx pool 5。私有权限映射合并到 /etc/pg-ops/config.json，保留 penpot_app/affine_app；使用既有 permissions.py/access.py。业务角色真实认证：mineru允许，postgres/penpot/affine均拒绝。配置改前私有快照 /var/lib/mineru-ops/pg-config-before.json。

任务、原始解析 JSON 和规范化块、阅读位置、文档与块收藏、会话哈希由 PostgreSQL 持久化。上传原PDF、完整上游 ZIP、所有原始JSON/MD和切图存业务私有目录；源文件不改写。异步worker仅一份、并发1；queued/uploading/processing/downloading 状态跨重启可恢复。上游错误、失效凭据、额度不足与一小时处理超时进入明确failed，原文件保留。首次队列上限30，文件200 MiB。服务环境由ops维护；生产数据路径使用systemd BindPaths挂载后的 /var/lib/mineru/state，不放宽HDD私有父目录。

## 已实现 API

写请求必须 Origin 精确匹配 MINERU_PUBLIC_URL；所有业务接口要求 __Host-mineru Cookie。Cookie Secure/HttpOnly/SameSite=Strict，会话只保存SHA256，普通会话14日。登录后端代理既有固定画板test身份，不新建用户、不重设密码；上游HTTP错误不转发原文或URL。日志不输出provider凭据或签名URL。

- POST /api/login {username,password}；POST /api/logout；GET /api/me。
- GET /api/documents → 文档数组；POST multipart /api/documents 的 file/model/ocr/formula/table/language → 新文档对象。当前仅PDF，检查扩展名及首1024字节内%PDF-魔数，真实流式限制200MiB；参数限制128字节。
- GET /api/documents/:id → 元信息、markdown、blocks、layout、content_list、reading、settings。page零基；bbox保持原页面坐标，缺失为null；page_width/page_height来自page_size。
- GET /api/documents/:id/original 支持PDF Range；assets/*path 服务规范化资源，canonicalize后限定bundle目录，禁止相对上跳。原始资源响应受CSP sandbox及nosniff约束。
- GET /api/documents/:id/export?format=markdown|json|zip。ZIP保留上游原包，JSON为包含原始layout/content_list的规范化对象。
- PATCH /api/documents/:id {favorite,reading:{page,selected_id,zoom}}；POST /api/documents/:id/blocks/:block_id/favorite {favorite} 幂等。
- GET /api/favorites → {documents,blocks:[{document_id,document_name,block}]}。
- GET /api/provider/status 仅已登录可读，无密钥。quota暂为null，因为尚无经验证的额度端点。
- GET /healthz 与 /api/health 匿名低信息健康。

## 原块映射

优先layout.json或*_middle.json的pdf_info，para_blocks优先，兼容preproc_blocks；保留discarded块标记。image/table容器拆body/caption/footnote，保持parent_id和各自bbox。每个物理块稳定ID由page与source_position生成；按page/index排序，保留text/html/latex/image_path。lines_deleted续片段按最近同类型物理块共享logical_id、merged_from，但每块只保存自己上游内容，不擅自重复拼接。新版本merge_prev原值保留，尚未扩大为未经核实的合并。图片裸hash只在ZIP库存中存在唯一同名文件时补成真实相对路径，否则标记image_missing，不伪造路径。content_list降级保留内容，不编造bbox。

解包限制：25,000成员、声明展开总量1GiB、拒绝路径穿越与符号链接；下载ZIP限制512MiB。上游URL只接受https且拒绝显式IP/localhost/嵌入凭据；URL来自受信provider返回，未宣称涵盖所有DNS重绑定情形。所有原始JSON均保留，复杂跨页表footnote不重写。

## 当前验证

backend-smoke.py使用私有短时test会话，通过真实Rust HTTP及实际免费Desktop API完成26项检查；结果见backend-smoke.json。自制1374字节PDF、上游真实输出1页8块（title/text/interline_equation/table_body/image_body及题注/脚注），不含用户原书。

通过：真实上传/解析/ZIP/切图；queued任务重启恢复；PDF Range206；Markdown/JSON/ZIP导出；阅读与文档/块收藏重启后持久化；收藏重复请求幂等；匿名文档/原文/资源/导出拒绝；缺Origin和错误Origin拒绝；错误密码拒绝；伪PDF拒绝；资源路径穿越拒绝。临时服务使用127.0.0.1:3067，结束必停止，不占生产3056。

短期QA凭据通过既有固定画板test-sessions机制签发，先请求上游/api/auth/session核实仍为test，再写MinerU独立两小时会话。仅存 /var/lib/mineru-ops/qa-session.json；公开仓库不含令牌。QA文档ID私下保存在 /var/lib/mineru-ops/qa-document-id.txt。

Rust fmt --check、clippy --all-targets -D warnings、3项单元测试及release构建结果由backend-engineering.json绑定最终源码与二进制摘要。单元测试覆盖物理坐标/跨页片段/父子块、缺坐标不伪造、ZIP路径穿越拒绝。部署、浏览器真实交互及备份恢复另由ops与主agent验证；本文件不代表用户已验收。

## 明确边界

当前仅PDF上传；无删除/重试按钮协议，失败可重新上传。未实现provider额度查询、跨账号共享、用户管理或自托管识别。Desktop凭据来自用户本机实际配置，只有服务端使用；协议和凭据差异见逆向报告。第三方配额/凭据可能失效，界面会返回明确失败，不能保证免费服务永久可用。
