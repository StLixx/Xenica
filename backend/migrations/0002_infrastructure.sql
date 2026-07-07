ALTER TABLE nodes ADD COLUMN IF NOT EXISTS embedding vector(1024);

CREATE TABLE IF NOT EXISTS search_index (
    node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    fts_vector tsvector NOT NULL,
    PRIMARY KEY (node_id, language)
);

CREATE INDEX IF NOT EXISTS idx_search_index_fts ON search_index USING gin(fts_vector);

CREATE INDEX IF NOT EXISTS idx_nodes_embedding ON nodes USING hnsw (embedding vector_cosine_ops);
