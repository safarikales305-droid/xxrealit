import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [AuthModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppConfigService, WhatsAppService],
  exports: [WhatsAppConfigService, WhatsAppService],
})
export class WhatsAppModule {}
