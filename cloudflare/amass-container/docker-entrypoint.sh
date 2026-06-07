#!/bin/sh
set -eu

CF_CONTAINER_CA="/etc/cloudflare/certs/cloudflare-containers-ca.crt"

if [ -f "$CF_CONTAINER_CA" ]; then
  cp "$CF_CONTAINER_CA" /usr/local/share/ca-certificates/cloudflare-containers-ca.crt
  update-ca-certificates >/dev/null 2>&1 || true
fi

exec node src/server.mjs
