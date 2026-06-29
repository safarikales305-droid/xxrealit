# Volitelný Docker build pro Railway (builder = DOCKERFILE).
# Nixpacks zůstává výchozí v railway.toml.
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Prisma schema musí existovat před postinstall (prisma generate)
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts

RUN npm ci

# Systémové knihovny + Chromium pro Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=0
RUN npx playwright install --with-deps chromium

RUN node scripts/prisma-cli.mjs generate

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
