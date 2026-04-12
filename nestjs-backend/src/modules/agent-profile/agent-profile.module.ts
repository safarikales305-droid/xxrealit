import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AgentProfileController } from './agent-profile.controller';
import { AgentProfileService } from './agent-profile.service';

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
  controllers: [AgentProfileController],
  providers: [AgentProfileService],
  exports: [AgentProfileService],
})
export class AgentProfileModule {}
