import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  console.log('🚀 BACKEND STARTED WITH CORS');

  app.enableCors({
    origin: [
      'https://xxrealit-production.up.railway.app',
      'http://localhost:3000',
    ],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Server running on port ${port}`);
}

bootstrap();
