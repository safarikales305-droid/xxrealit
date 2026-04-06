import { ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';

function parseExtraCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function buildCorsOriginAllowlist(): string[] {
  return [
    'https://xxrealit-production.up.railway.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...parseExtraCorsOrigins(),
  ];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const prisma = app.get(PrismaService);

  try {
    const [postTable, videoTable] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ table: string | null }>>(
        `SELECT to_regclass('public."Post"') AS table`,
      ),
      prisma.$queryRawUnsafe<Array<{ table: string | null }>>(
        `SELECT to_regclass('public."Video"') AS table`,
      ),
    ]);
    if (!postTable?.[0]?.table || !videoTable?.[0]?.table) {
      const missing = [
        !postTable?.[0]?.table ? 'Post' : null,
        !videoTable?.[0]?.table ? 'Video' : null,
      ]
        .filter(Boolean)
        .join(', ');
      throw new Error(
        `Missing DB tables: ${missing}. Run "prisma migrate deploy" on startup/deploy.`,
      );
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021'
    ) {
      console.error(
        '[DB] Prisma table missing (P2021). Ensure migrations are applied: prisma migrate deploy',
      );
    } else {
      console.error('[DB] Database schema check failed:', error);
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

  const uploadsRoot = join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsRoot)) {
    fs.mkdirSync(uploadsRoot, { recursive: true });
  }
  const propertiesUploadRoot = join(uploadsRoot, 'properties');
  if (!fs.existsSync(propertiesUploadRoot)) {
    fs.mkdirSync(propertiesUploadRoot, { recursive: true });
  }
  const videosUploadRoot = join(uploadsRoot, 'videos');
  if (!fs.existsSync(videosUploadRoot)) {
    fs.mkdirSync(videosUploadRoot, { recursive: true });
  }

  app.useStaticAssets(uploadsRoot, { prefix: '/uploads/' });

  const corsAllowlist = buildCorsOriginAllowlist();
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsAllowlist.includes(origin)) {
        callback(null, true);
        return;
      }
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
