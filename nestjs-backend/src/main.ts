import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';

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

  const uploadsDir = join(process.cwd(), 'uploads');
  const propertiesUploadDir = join(uploadsDir, 'properties');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  if (!existsSync(propertiesUploadDir)) {
    mkdirSync(propertiesUploadDir, { recursive: true });
  }
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  app.enableCors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  });

  // 🔥 Railway FIX – natvrdo 8080
  const port = 8080;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Backend running on ${port}`);
}

bootstrap();