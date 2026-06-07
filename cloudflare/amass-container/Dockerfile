FROM node:22-bookworm-slim

ARG AMASS_VERSION=v5.1.1
ARG TARGETARCH
ENV NODE_ENV=production
ENV PORT=8080
ENV AMASS_VERSION=${AMASS_VERSION}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl dnsutils tar \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  arch="${TARGETARCH:-amd64}"; \
  case "$arch" in amd64|arm64) ;; *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; esac; \
  curl -fsSL "https://github.com/owasp-amass/amass/releases/download/${AMASS_VERSION}/amass_linux_${arch}.tar.gz" \
  | tar -xz -C /tmp \
  && install -m 0755 "/tmp/amass_linux_${arch}/amass" /usr/local/bin/amass \
  && rm -rf "/tmp/amass_linux_${arch}"

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
