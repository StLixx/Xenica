//! Xenica 的领域模型。
//!
//! 这里只放数据原语和它们的规则（见 `docs/adr/0002-data-primitives.md`）。
//! 本 crate 不准依赖数据库、网络、异步运行时或任何插件——由 `scripts/check-arch.sh` 在 CI 里检查。

mod edge;
mod error;
mod id;
mod node;
mod trace;

pub use edge::{Edge, NewEdge};
pub use error::DomainError;
pub use id::{EdgeId, NodeId, TraceId};
pub use node::{NewNode, Node, NodePatch};
pub use trace::{Actor, Trace};

/// 标题的最大长度（字符数）。
pub const MAX_TITLE_CHARS: usize = 500;
