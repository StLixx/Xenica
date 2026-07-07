FROM abcfy2/zhparser:17

RUN apt-get update && apt-get install -y --no-install-recommends postgresql-17-pgvector && \
    rm -rf /var/lib/apt/lists/*

COPY docker-entrypoint-init.d /docker-entrypoint-initdb.d/
