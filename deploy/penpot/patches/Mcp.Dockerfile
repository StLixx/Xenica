FROM penpotapp/mcp@sha256:5e811e6eeb179d80d8781fb0ffd2991560785d150b3676f1ac5e28d63ba9f7c2
LABEL org.opencontainers.image.version="2.18.3-ms11927" \
      org.opencontainers.image.revision="ff7a66f51938b2293260ea27a64e2c4e0833b5e3+8efbd9b5d3fc7f3b0b174efcc6c665033318dcad"
COPY server/ /opt/penpot/mcp/
