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
  return url.trim().replace(/\/+$/, '');
}

function parseExtraCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => normalizeOrigin(o))
    .filter(Boolean);
}

/** Production frontend + local dev; extend with CORS_ORIGINS=comma-separated URLs on Railway. */
function buildCorsOriginAllowlist(): string[] {
  const list = [
    'https://xxrealit-production.up.railway.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...parseExtraCorsOrigins(),
  ];
  return [...new Set(list.map(normalizeOrigin))];
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
  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin / non-browser clients (no Origin header)
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = normalizeOrigin(origin);
      if (corsAllowlist.includes(normalized)) {
        callback(null, true);
        return;
      }
      console.warn(
        `[CORS] Rejected Origin="${origin}". Allowed: ${corsAllowlist.join(', ')} — set CORS_ORIGINS if needed.`,
      );
      callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  const port = Number(process.env.PORT) || 8080;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Backend running on ${port}`);
}

bootstrap();
