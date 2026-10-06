use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

macro_rules! id_type {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, ToSchema)]
        #[serde(transparent)]
        #[schema(value_type = String, format = Uuid)]
        pub struct $name(pub Uuid);

        impl $name {
            /// 生成新 ID。UUID v7：全局唯一、按时间有序、离线也能生成（规则 4）。
            pub fn new() -> Self {
                Self(Uuid::now_v7())
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(f)
            }
        }

        impl From<Uuid> for $name {
            fn from(value: Uuid) -> Self {
                Self(value)
            }
        }
    };
}

id_type!(
    /// 节点 ID。身份只看 ID，不看名字。
    NodeId
);
id_type!(
    /// 关系 ID。
    EdgeId
);
id_type!(
    /// 痕迹 ID。
    TraceId
);
