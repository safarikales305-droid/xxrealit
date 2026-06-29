# Volitelný Docker build pro Railway (builder = DOCKERFILE).
# Nixpacks zůstává výchozí v railway.toml.
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# Systémové knihovny + Chromium pro Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=0
RUN npx playwright install --with-deps chromium

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
