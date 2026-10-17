ARG NODE_IMAGE=docker.m.daocloud.io/library/node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
FROM ${NODE_IMAGE} AS build
WORKDIR /app/upstream
COPY upstream/package.json upstream/package-lock.json ./
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm ci --no-audit --no-fund --registry=${NPM_REGISTRY}
COPY upstream/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund
FROM ${NODE_IMAGE}
WORKDIR /app/upstream
COPY --from=build /app/upstream/node_modules ./node_modules
COPY --from=build /app/upstream/dist ./dist
COPY --from=build /app/upstream/package.json /app/upstream/tool-manifest.json /app/upstream/LICENSE ./
COPY adapter/ ./adapter/
ENV UPSTREAM_ROOT=/app/upstream AFFINE_AUTHORING_CONFIG=/private/bridge.json AFFINE_CLIENT_VERSION=0.27.4 AFFINE_WS_CLIENT_VERSION=0.27.4
USER 65532:65532
CMD ["node", "adapter/adapter.mjs"]
