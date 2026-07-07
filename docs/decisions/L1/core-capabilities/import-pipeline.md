## ADR / L1 / core-capabilities / 导入管道：抽象接口与多格式处理

**状态**: accepted
**日期**: 2026-07-07
**来源 thread**: core-capabilities

## Context

Phase 2 需要支持外部内容导入：PDF 拆成节点、视频提取字幕和 PPT、图片批量上传。核心流程对任何格式都一样——接收文件 → 处理 → 输出节点和边——但每种格式的处理逻辑不同。今天用 MinerU 处理 PDF，用 ffmpeg 处理视频，明天可能换 Gemini 3.1 Pro 或别的技术。

关键是：**核心代码不能因为换处理器而改动。** 核心只认接口，不认具体实现。

## Decision

### What

定义一个 Rust trait `ImportHandler` 作为所有格式处理器的统一抽象：

```rust
pub struct ImportInput {
    pub file_path: PathBuf,
    pub mime_type: String,          // "application/pdf", "video/mp4" ...
    pub user_notes: Option<String>,  // 导入时附带的标注/语音转录文本
    pub batch_id: Option<Uuid>,      // 批量导入的批次标识
}

pub struct ImportOutput {
    pub nodes: Vec<NewNode>,
    pub edges: Vec<NewEdge>,
}

pub struct NewNode {
    pub content: String,
    pub connections: Vec<(usize, String)>,  // 引用 ImportOutput.nodes 的索引 + label
}

pub struct NewEdge {
    pub source_index: usize,
    pub target_index: usize,
    pub label: String,
}

pub trait ImportHandler: Send + Sync {
    fn supported_mime_types(&self) -> Vec<String>;
    fn process(&self, input: ImportInput) -> Result<ImportOutput, ImportError>;
}
```

核心通过注册表路由：

```rust
type HandlerRegistry = HashMap<String, Box<dyn ImportHandler>>;
// key = mime_type, value = handler

fn registry() -> HandlerRegistry {
    // Phase 2: 编译时注册，未来可改为运行时动态加载
}
```

Worker 拿到 task 后：查 MIME type → 找到 handler → 调 `process()` → 拿到 ImportOutput → 写 nodes + edges 到 PG。

### 两种集成路径

| 路径 | 通信方式 | 适合 |
|------|------|------|
| **库内直调**（同进程） | `Box<dyn ImportHandler>` 直接调用 | 简单文本提取、图片存储 |
| **独立子项目**（跨进程） | CLI 子进程，stdout/stderr 交互 | 需要外部依赖的复杂处理、需要解耦异步拆分的场景 |

两种路径共用同一个 trait 签名——独立子项目通过一层薄适配器（`ExternalCliHandler`）也实现 `ImportHandler trait`，核心只认接口不认进程边界。

### Phase 2 默认实现

以下处理器在 Phase 2 期间至少跑通一个端到端：

| 格式 | 默认实现 | 路径 |
|------|------|------|
| PDF（论文、教科书、含图文档） | MinerU API。独立 CLI 子应用，自带内部任务队列——接收一个大 PDF 后自动检测是否超限（300MB / 页数），超过阈值则拆分为多个子文件，并发调用 MinerU 免费 API，不超出频率和大小限额，全部完成后按原文顺序重组 Markdown 输出。此 CLI 子应用可独立开发、独立运行，通过 `ExternalCliHandler` 适配器接入 Xenica 的 ImportHandler trait | 独立子项目 |
| PDF（简单文本提取） | pdf-extract（本地 crate） | 库内直调 |
| 视频（讲师类：PPT + 字幕） | ffmpeg 提取关键帧 + eg 字幕提取（ass/srt → text） | 独立子项目 |
| 图片（批量导入） | 无需处理，图片文件直存 → 创建节点引用文件路径 | 库内直调 |
| 图片（OCR 识别） | 暂不实现——本地 OCR 依赖 tesseract 安装，调用链长。留接口。 | 独立子项目（未来） |
| 音频（语音标注转录） | 语音标注由 AI API 转文本（如硅基流动 whisper 或未来其他模型）→ 文本存为节点的 user_notes，稍后组织 | 库内直调 |
| 纯文本（Markdown、代码文件、便签） | 直接读文本内容 → 创建节点 | 库内直调 |

### Why

- **核心不可变**：`ImportHandler trait` 是稳定的抽象。换处理器 = 换一个 trait 的实现对象，核心一行不改。
- **多格式兼容**：加一种格式 = 新增一个 handler + 在注册表里加一行。不需要 `if pdf { ... } else if video { ... }`。
- **API 不区分格式**：POST /import 收到文件，读 MIME type，路由 handler。前端不需要知道后端用了哪个处理器。
- **独立子项目可自由选择语言**：ffmpeg 视频处理用 Python 写最方便——通过 CLI 适配器包装，Rust 核心只跟 stdout 交互，不需要在 Rust 生态里找视频库。
- **批量和零星导入共用同一个接口**：`batch_id` 不为空时表示属于某次批量操作，创建节点时自动连到批次节点上。用户导入后可以暂不连边，将来在图形界面上逐个整理。

### What was avoided

- **在核心代码里嵌具体处理逻辑**：不在 core crate 里写 `mineru::process_pdf(...)` 或 `ffmpeg::extract_subtitles(...)`。这些依赖放在 handler 实现里。
- **每个格式一个 API 端点**：不搞 `/import/pdf`、`/import/video`、`/import/image` 多端点。MIME type 是 handler 路由的参数，前端只需知道文件的内容类型。
- **用 database migration 注册格式**：格式支持不写入数据库 schema——它是纯代码配置，不需要 DDL。

### Phase 2 暂不覆盖的格式

| 格式 | 原因 | 何时覆盖 |
|------|------|------|
| 视频（剧情/影视分析，需视觉理解） | 需要多模态大模型 API（Gemini 3.1 Pro 等），价格高且非当前使用场景 | 未来 MCP 集成或前端手动标注时覆盖 |
| 3D 模型（Blender、Fusion360） | 没有可行的语义提取方案，暂时纯文件存储 | 等前端 3D 预览器 |
| 化学结构式 | 提取需要专门 SDK（RDKit 等），预览器需要前端实现 | 前端预览器 Phase 3 |
| LaTeX 公式 | 纯文本格式，直接存 content 即可，不涉及转换 | 前端公式渲染 Phase 3 |

## Rationale（用户直接阐述的思考）

[用户]：不可变的东西要设计好——导入管道的输入输出是稳定的抽象。可变的东西（MinerU、ffmpeg、未来的 Gemini）要能随时替换。核心代码不应该有任何一处因为"我换了个 PDF 处理器"而改动。独立子项目是好思路——视频处理用 Python 调 ffmpeg 方便得多，没有必要在 Rust 里找视频库。图片批量导入的典型场景是手机端先语音标注再回来整理——`user_notes` 和 `batch_id` 就是为这个设计的。

## Alternatives Considered

- **每个格式一个 API 端点**：简单但前端耦合——每加一种格式前端就要适配一个新 URL。MIME type 路由让前端完全不知后端的格式支持变化。放弃。
- **handler 实现在内核 crate 里**：代码集中但不可独立演进。ffmpeg 依赖编译慢，MinerU SDK 可能几个月后大版本升级导致 break core 的 build。独立子项目避免跨语言/跨版本依赖的交缠。放弃。
- **在数据库里注册 handler**：概念上优雅但过度设计。编译时静态注册已满足 Phase 2 需要——你一个人开发，格式加法不是一个运行时频繁操作。运行时动态加载留给 Phase 3+。

## AI Role

[AI]：基于 Dependency Inversion Principle 和 Hexagonal Architecture 的 Driven Port 模式设计了 ImportHandler trait + ImportInput/ImportOutput + HandlerRegistry 三层抽象。分析了库内直调 vs 独立子项目两条集成路径的适用场景。将用户实际使用经验（MinerU 手动拆 PDF、ffmpeg 提取视频字幕）映射到了 Phase 2 的默认实现列表。

## Consequences

- ✅ 核心和处理器彻底解耦——换处理器不影响核心代码
- ✅ 加格式 = 加 handler + 注册表插入，不改核心
- ✅ 独立子项目可用其他语言（Python/JS），不受 Rust crate 生态限制
- ⚠️ 跨进程通信多一层延迟——但对异步导入任务来说，几百毫秒的进程启动开销完全在可接受范围内
- ⚠️ handler 错误处理需要统一——`ImportError` 要把各种外部依赖的错误归一化成核心可理解的形式

## 跨 thread 关联

- **数据模型**：ImportOutput 中的 nodes 和 edges 最终写入 [data-model ADR](../architecture-foundation/data-model.md) 定义的 nodes + edges 两张表，不修改核心表 schema。
- **Worker 队列**：handler 的实际调用由 worker 触发，详见 [core-capabilities scope](scope.md) 中的 Worker 四队列部分。
