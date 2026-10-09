//! Xenica 的领域模型。
//!
//! 这里只放数据原语和它们的规则（见 `docs/adr/0002-data-primitives.md`）。
//! 本 crate 不准依赖数据库、网络、异步运行时或任何插件——由 `scripts/check-arch.sh` 在 CI 里检查。

mod edge;
mod error;
mod id;
mod node;
mod refs;
mod trace;
mod user;

pub use edge::{Edge, NewEdge};
pub use error::DomainError;
pub use id::{EdgeId, NodeId, TraceId, UserId};
pub use node::{NewChildren, NewNode, Node, NodePatch, md};
pub use refs::extract_refs;
pub use trace::{Actor, Trace};
pub use user::{MIN_PASSWORD_CHARS, User, check_password, normalize_user_name};

/// 标题的最大长度（字符数）。
pub const MAX_TITLE_CHARS: usize = 500;

/// 关系类型：父节点按顺序包含子节点（一页里的各块）。
pub const CONTAINS: &str = "contains";
/// 关系类型：正文里用 `#标记` 或 `[[名字]]` 提到了另一个节点。由存储层根据正文自动维护。
pub const MENTIONS: &str = "mentions";
