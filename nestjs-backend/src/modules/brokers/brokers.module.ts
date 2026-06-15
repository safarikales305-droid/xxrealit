import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BrokersController } from './brokers.controller';
import { BrokersService } from './brokers.service';
import { ProfessionalsController } from './professionals.controller';

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
  controllers: [BrokersController, ProfessionalsController],
  providers: [BrokersService],
  exports: [BrokersService],
})
export class BrokersModule {}
