FROM penpotapp/frontend@sha256:bb8abe27d53de84c95597f2c02c0e702b2779971fb0703e543f9ecf183e999f6
LABEL org.opencontainers.image.version="2.18.3-ms11927-r2" \
      org.opencontainers.image.revision="ff7a66f51938b2293260ea27a64e2c4e0833b5e3+8efbd9b5d3fc7f3b0b174efcc6c665033318dcad"
COPY frontend/ /var/www/app/
COPY plugin/ /var/www/app/plugins/mcp/
COPY plugin/ /var/www/app/plugins/mcp/2.18.3-ms11927-r2/
