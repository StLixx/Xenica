# The base preserves the installed official multi-session backport (#73).
ARG BASE_IMAGE=penpot-local/frontend:2.18.3-ms11927-r2
FROM ${BASE_IMAGE}
ARG EMBED_VERSION=2.18.3-html81-r7
LABEL org.opencontainers.image.version="${EMBED_VERSION}" \
      org.opencontainers.image.revision="xenica-81-html-embed"
COPY js/ /var/www/app/js/
COPY index.html render.html rasterizer.html /var/www/app/
COPY plugin/ /var/www/app/plugins/mcp/${EMBED_VERSION}/
