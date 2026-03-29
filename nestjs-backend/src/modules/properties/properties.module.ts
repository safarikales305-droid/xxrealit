import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { SeedController } from './seed.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-jwt-secret-change-me',
      }),
    }),
  ],
  controllers: [PropertiesController, SeedController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
