import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function buildCorsOrigins(): string[] {
  const envList =
    process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ??
    [];
  const defaults = [
    'https://friendly-celebration-production-0db4.up.railway.app',
    'https://friendly-celebration-production.up.railway.app',
  ];
  return [...new Set([...defaults, ...envList])];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  console.log('🚀 BACKEND STARTED WITH CORS');

  app.enableCors({
    origin: buildCorsOrigins(),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT || 3000);
}

bootstrap();
