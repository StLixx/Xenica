-- 运行资格与短期授权不属于知识节点，令牌只保存哈希。
create table development_runtimes (
    id uuid primary key,
    version text not null unique,
    artifact text not null,
    snapshot text not null,
    generation bigint not null default 1,
    state text not null check (state in ('preparing','running','stopping','stopped','failed')),
    message text not null default '',
    touched_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table runtime_grants (
    token_hash bytea primary key,
    runtime uuid not null references development_runtimes(id),
    generation bigint not null,
    user_id uuid not null references users(id),
    expires_at timestamptz not null,
    consumed boolean not null default false,
    session boolean not null default false
);
