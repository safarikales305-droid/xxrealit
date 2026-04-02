import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  console.log('🚀 BACKEND STARTED WITH CORS');

  app.enableCors({
    origin: ['https://friendly-celebration-production-0db4.up.railway.app'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT || 3000);
}

bootstrap();
