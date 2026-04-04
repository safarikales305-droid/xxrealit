import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // ✅ API PREFIX
    app.setGlobalPrefix('api');

    // ✅ CORS (ALLOW EVERYTHING FOR DEBUG)
    app.enableCors({
      origin: true,
      credentials: true,
    });

    // ✅ PORT (Railway)
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;

    await app.listen(port, '0.0.0.0');

    console.log(`🚀 Backend running on port ${port}`);
  } catch (err) {
    console.error('❌ BOOTSTRAP ERROR:', err);
    process.exit(1);
  }
}

bootstrap();