-- 账号与会话（docs/adr/0007-auth.md）。密钥不进图：这两张表不是节点。
create table users (
    id            uuid primary key,
    name          text        not null,
    -- Argon2id，PHC 字符串格式
    password_hash text        not null,
    created_at    timestamptz not null default now()
);

create unique index users_name_key on users (lower(name));

-- 只存令牌的 SHA-256；令牌本身只在用户浏览器的 Cookie 里。
create table sessions (
    token_hash bytea       primary key,
    user_id    uuid        not null references users (id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index sessions_user_idx on sessions (user_id);
