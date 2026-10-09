-- v0.2.0：块即节点。
-- 标题可以为空（没有标题时界面用正文第一行代替）。
alter table nodes alter column title set default '';

-- 「包含」关系的顺序（一页里各块的先后）。其他关系为空。
alter table edges add column pos integer;
create index edges_source_kind_idx on edges (source, kind, pos);

-- 文件（截图等）：原始数据，不可变，按内容去重。
create table files (
    id         uuid primary key,
    sha256     text        not null unique,
    mime       text        not null,
    size       integer     not null,
    bytes      bytea       not null,
    created_at timestamptz not null default now()
);
