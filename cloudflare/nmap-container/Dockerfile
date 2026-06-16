FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8080
ENV NMAP_CONTAINER_BUILD=cidr-v3-httpx-tech
ENV HTTPX_VERSION=v1.9.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl nmap unzip \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  version="${HTTPX_VERSION#v}"; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64) httpx_arch="amd64" ;; \
    arm64) httpx_arch="arm64" ;; \
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://github.com/projectdiscovery/httpx/releases/download/v${version}/httpx_${version}_linux_${httpx_arch}.zip" -o /tmp/httpx.zip; \
  unzip -q /tmp/httpx.zip -d /tmp/httpx; \
  install -m 0755 /tmp/httpx/httpx /usr/local/bin/httpx; \
  rm -rf /tmp/httpx /tmp/httpx.zip; \
  httpx -version

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
