-- 节点：一切有身份的东西。ID 由应用生成（UUID v7），不靠数据库。
create table nodes (
    id         uuid primary key,
    kind       text        not null,
    title      text        not null,
    body       jsonb       not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index nodes_updated_at_idx on nodes (updated_at desc);

-- 关系：有类型、有方向。
create table edges (
    id         uuid primary key,
    source     uuid        not null references nodes (id) on delete cascade,
    target     uuid        not null references nodes (id) on delete cascade,
    kind       text        not null,
    created_at timestamptz not null default now(),
    constraint edges_no_self_loop check (source <> target),
    constraint edges_unique unique (source, target, kind)
);

create index edges_target_idx on edges (target);

-- 痕迹：只增不改。subject 不设外键——被删除的东西也要留下记录。
create table traces (
    id      uuid primary key,
    at      timestamptz not null default now(),
    actor   text        not null,
    action  text        not null,
    subject uuid        not null,
    detail  jsonb       not null default '{}'::jsonb
);

create index traces_subject_idx on traces (subject, at);

create function traces_forbid_change() returns trigger
    language plpgsql as
$$
begin
    raise exception 'traces are append-only';
end
$$;

create trigger traces_append_only
    before update or delete on traces
    for each row execute function traces_forbid_change();
