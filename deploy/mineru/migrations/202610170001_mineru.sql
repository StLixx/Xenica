CREATE TABLE IF NOT EXISTS mineru_sessions (
    hash TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
    expires TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mineru_sessions_expiry ON mineru_sessions(expires);
CREATE TABLE IF NOT EXISTS mineru_documents (
    id UUID PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, size BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', error TEXT, pages INTEGER NOT NULL DEFAULT 0,
    favorite BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settings JSONB NOT NULL DEFAULT '{}', provider JSONB NOT NULL DEFAULT '{}',
    reading JSONB NOT NULL DEFAULT '{"page":0,"selected_id":null,"zoom":1}',
    result JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS mineru_documents_owner ON mineru_documents(owner,created_at DESC);
CREATE INDEX IF NOT EXISTS mineru_documents_status ON mineru_documents(status);
CREATE TABLE IF NOT EXISTS mineru_block_favorites (
    document_id UUID NOT NULL REFERENCES mineru_documents(id) ON DELETE CASCADE,
    block_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(document_id,block_id)
);
