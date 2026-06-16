FROM node:22-alpine3.23

ENV NODE_ENV=production
ENV PORT=8080
ENV NIKTO_VERSION=2.6.0
ENV NIKTO_HOME=/opt/nikto
ENV NIKTO_CONTAINER_BUILD=nikto-2.6.0-safe-lab

RUN apk add --no-cache \
    ca-certificates \
    curl \
    perl \
    perl-io-socket-ssl \
    perl-json \
    perl-mime-base64 \
    perl-net-ssleay \
    perl-xml-libxml \
    perl-xml-writer \
  && addgroup -S nikto \
  && adduser -S -G nikto -g "Nikto user" -s /bin/sh nikto

RUN set -eux; \
  curl -fsSL "https://github.com/sullo/nikto/archive/refs/tags/${NIKTO_VERSION}.tar.gz" -o /tmp/nikto.tgz; \
  mkdir -p /tmp/nikto-src "${NIKTO_HOME}"; \
  tar -xzf /tmp/nikto.tgz -C /tmp/nikto-src --strip-components=1; \
  cp -R /tmp/nikto-src/program/. "${NIKTO_HOME}/"; \
  chown -R nikto:nikto "${NIKTO_HOME}"; \
  rm -rf /tmp/nikto.tgz /tmp/nikto-src; \
  "${NIKTO_HOME}/nikto.pl" -Version

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
  && chown -R nikto:nikto /app

USER nikto
CMD ["./docker-entrypoint.sh"]
