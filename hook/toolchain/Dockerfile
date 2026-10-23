FROM node:22.17.0-bookworm-slim@sha256:b04ce4ae4e95b522112c2e5c52f781471a5cbc3b594527bcddedee9bc48c03a0
WORKDIR /opt/toolchain
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY configure-compiler.mjs compile-hook.mjs ./
RUN node configure-compiler.mjs
ENTRYPOINT ["node", "/opt/toolchain/compile-hook.mjs"]
