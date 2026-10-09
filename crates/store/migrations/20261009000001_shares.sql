-- v0.3.0：分享链接。
-- 一段地址凭据：知道链接就能看（AI 读链接靠它，不用登录），随时可以作废。
-- 按规则「密钥不进图」，它存在这里，不是节点。
create table shares (
    id         uuid primary key,
    node       uuid        not null references nodes (id) on delete cascade,
    token      text        not null unique,
    mode       text        not null check (mode in ('read', 'write')),
    created_at timestamptz not null default now(),
    revoked_at timestamptz
);

-- 一个节点下的链接列表。
create index shares_node_idx on shares (node, created_at desc);
