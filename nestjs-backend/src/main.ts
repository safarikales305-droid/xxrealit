import { ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as fs from 'node:fs';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';
import {
  ensureStandardUploadSubdirs,
  getUploadsPath,
} from './lib/uploads-path';

function normalizeOrigin(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    const isDefaultPort =
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80');
    if (isDefaultPort) {
      parsed.port = '';
      return parsed.toString().replace(/\/+$/, '');
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/** Čárkou oddělené URL (Railway / více frontendů). */
function parseCommaSeparatedOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((o) => normalizeOrigin(o))
    .filter(Boolean);
}

function parseCommaSeparatedHeaders(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
}

function isAllowedCorsOrigin(origin: string, allowlist: string[]): boolean {
  const normalized = normalizeOrigin(origin);
  if (allowlist.includes(normalized)) return true;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (host === 'xxrealit.cz' || host === 'www.xxrealit.cz') return true;
    if (host.endsWith('.xxrealit.cz')) return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * Povolené Origin hodnoty pro browser (JWT v Authorization; cookies dle nastavení).
 * Na Railway nastavte např. FRONTEND_URL=https://www.xxrealit.cz
 * nebo CORS_ORIGINS=https://www.xxrealit.cz,https://xxrealit.cz
 */
function buildCorsOriginAllowlist(): string[] {
  const fromEnv = [
    ...parseCommaSeparatedOrigins(process.env.CORS_ORIGINS),
    ...parseCommaSeparatedOrigins(process.env.FRONTEND_URL),
    ...parseCommaSeparatedOrigins(process.env.CORS_ORIGIN),
    ...parseCommaSeparatedOrigins(process.env.NEXT_PUBLIC_SITE_URL),
    ...parseCommaSeparatedOrigins(process.env.PUBLIC_APP_URL),
  ];
  const defaults = [
    'https://www.xxrealit.cz',
    'https://xxrealit.cz',
    'https://xxrealit-production.up.railway.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4200',
    'http://127.0.0.1:4200',
  ];
  return [...new Set([...defaults, ...fromEnv].map(normalizeOrigin))];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const prisma = app.get(PrismaService);

  try {
    // Verify `Post` / `Video` exist via ORM (no raw SQL / regclass).
    await Promise.all([
      prisma.post.findFirst({ select: { id: true } }),
      prisma.video.findFirst({ select: { id: true } }),
    ]);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021'
    ) {
      console.error(
        '[DB] Table missing (Post / Video?). Run: prisma migrate deploy',
      );
    } else {
      console.error('[DB] Schema readiness check failed:', error);
    }
    throw error;
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.setGlobalPrefix('api');

  ensureStandardUploadSubdirs();
  const uploadsRoot = getUploadsPath();
  if (!fs.existsSync(uploadsRoot)) {
    fs.mkdirSync(uploadsRoot, { recursive: true });
  }

  app.useStaticAssets(uploadsRoot, { prefix: '/uploads/' });

  const corsAllowlist = buildCorsOriginAllowlist();
  console.log(
    `[CORS] Startup — ${corsAllowlist.length} allowed origin(s): ${corsAllowlist.join(' | ')}`,
  );
  console.log(
    '[CORS] Tip: na produkci přidejte doménu přes FRONTEND_URL nebo CORS_ORIGINS (viz .env.example).',
  );

  app.enableCors({
    origin: (origin, callback) => {
      // Postman, curl, server-to-server, healthcheck — bez hlavičky Origin
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = normalizeOrigin(origin);
      if (isAllowedCorsOrigin(origin, corsAllowlist)) {
        // Reflect konkrétní origin (nutné při credentials / cookies cross-site).
        callback(null, normalized);
        return;
      }
      console.warn(
        `[CORS] BLOCKED Origin="${origin}" (normalized="${normalized}"). Allowlist: ${corsAllowlist.join(', ')} — set FRONTEND_URL or CORS_ORIGINS on the API.`,
      );
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Accept-Language',
      'Origin',
      'X-Requested-With',
      'baggage',
      'sentry-trace',
      ...parseCommaSeparatedHeaders(process.env.CORS_EXTRA_HEADERS),
    ],
    exposedHeaders: ['Content-Length'],
    optionsSuccessStatus: 204,
    maxAge: 86_400,
  });

  const port = Number(process.env.PORT) || 8080;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Backend running on ${port}`);
}

bootstrap();
