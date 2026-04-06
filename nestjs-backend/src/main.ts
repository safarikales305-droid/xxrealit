import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';

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
