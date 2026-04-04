import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // API prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // 🔥 Railway dynamic PORT (MUSÍ být number)
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  // 🔥 důležité pro Railway (0.0.0.0)
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Backend running on ${port}`);
}

bootstrap();