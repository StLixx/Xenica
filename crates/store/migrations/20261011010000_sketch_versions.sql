-- 草图历史不只是一条 body_changed 痕迹；每次修改前保留完整版本。
create table sketch_versions (
    node uuid not null,
    revision timestamptz not null,
    title text not null,
    body jsonb not null,
    primary key (node, revision)
);
