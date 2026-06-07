FROM node:22-bookworm-slim

ARG NUCLEI_VERSION=v3.8.0
ARG TARGETARCH
ENV NODE_ENV=production
ENV PORT=8080
ENV NUCLEI_VERSION=${NUCLEI_VERSION}
ENV NUCLEI_TEMPLATES_DIR=/root/nuclei-templates
ENV SURFACESCAN_NUCLEI_TEMPLATES_DIR=/opt/surfacescan360-nuclei-templates

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  version="${NUCLEI_VERSION#v}"; \
  arch="${TARGETARCH:-amd64}"; \
  case "$arch" in amd64|arm64) ;; *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; esac; \
  curl -fsSL "https://github.com/projectdiscovery/nuclei/releases/download/${NUCLEI_VERSION}/nuclei_${version}_linux_${arch}.zip" -o /tmp/nuclei.zip; \
  unzip -q /tmp/nuclei.zip -d /tmp/nuclei; \
  install -m 0755 /tmp/nuclei/nuclei /usr/local/bin/nuclei; \
  mkdir -p /root/.config/nuclei; \
  touch /root/.config/nuclei/.nuclei-ignore; \
  rm -rf /tmp/nuclei /tmp/nuclei.zip

RUN set -eux; \
  curl -fsSL "https://github.com/projectdiscovery/nuclei-templates/archive/refs/heads/main.tar.gz" \
  | tar -xz -C /tmp; \
  mv /tmp/nuclei-templates-main "${NUCLEI_TEMPLATES_DIR}"; \
  test -d "${NUCLEI_TEMPLATES_DIR}/http/exposures"; \
  test -d "${NUCLEI_TEMPLATES_DIR}/http/misconfiguration"; \
  test -d "${NUCLEI_TEMPLATES_DIR}/http/vulnerabilities"; \
  test -d "${NUCLEI_TEMPLATES_DIR}/http/cves"; \
  test -d "${NUCLEI_TEMPLATES_DIR}/http/technologies"

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY templates ${SURFACESCAN_NUCLEI_TEMPLATES_DIR}

CMD ["node", "src/server.mjs"]
