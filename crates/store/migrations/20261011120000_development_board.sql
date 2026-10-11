-- 固定开发画板是普通草图节点；只约束身份唯一，不另建一套设计存储。
create unique index nodes_one_development_board on nodes ((body->>'purpose'))
where kind = 'sketch' and body->>'purpose' = 'development';
