# syntax=docker/dockerfile:1
# 单镜像：Rust 服务 + 前端静态文件。构建：docker build -t xenica .

FROM node:24-slim AS web
WORKDIR /src/web
RUN npm install -g pnpm@12.9.1
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY web/ ./
# 前端 + Storybook（预览站的 /storybook/ 用它看每个组件）
RUN pnpm build && pnpm build-storybook --quiet && mv storybook-static dist/storybook

FROM rust:1.99-slim-trixie AS server
WORKDIR /src
# 不复制 rust-toolchain.toml：镜像自带同版本工具链，省去下载 clippy/rustfmt。
COPY Cargo.toml Cargo.lock ./
COPY .sqlx .sqlx
COPY crates crates
ENV SQLX_OFFLINE=true
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p xenica-server \
    && cp target/release/xenica /usr/local/bin/xenica

FROM gcr.io/distroless/cc-debian13:nonroot
LABEL org.opencontainers.image.source="https://github.com/StLixx/Xenica"
WORKDIR /app
COPY --from=server /usr/local/bin/xenica /app/xenica
COPY --from=web /src/web/dist /app/web
# CI 传入构建的 commit，界面和 /api/health 会显示它。
ARG XENICA_COMMIT=
ENV XENICA_ADDR=0.0.0.0:8080 \
    XENICA_WEB_DIST=/app/web \
    XENICA_COMMIT=$XENICA_COMMIT \
    RUST_LOG=info
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 CMD ["/app/xenica", "healthcheck"]
ENTRYPOINT ["/app/xenica"]
CMD ["serve"]
