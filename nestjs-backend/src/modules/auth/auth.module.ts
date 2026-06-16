import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { BonusCampaignModule } from '../bonus-campaign/bonus-campaign.module';
import { UsersModule } from '../users/users.module';
import { RegistrationGateModule } from '../registration-gate/registration-gate.module';
import { EmailsModule } from '../emails/emails.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => UsersModule),
    forwardRef(() => RegistrationGateModule),
    forwardRef(() => BonusCampaignModule),
    EmailsModule,
    forwardRef(() => WhatsAppModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-jwt-secret-change-me',
        signOptions: { expiresIn: '7d', algorithm: 'HS256' as const },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtModule, PassportModule, JwtStrategy, JwtAuthGuard],
})
export class AuthModule {}
