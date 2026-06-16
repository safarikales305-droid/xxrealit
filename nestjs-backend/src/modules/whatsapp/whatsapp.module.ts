import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppAdminController } from './whatsapp-admin.controller';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppMarketingService } from './whatsapp-marketing.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [WhatsAppController, WhatsAppAdminController],
  providers: [
    WhatsAppSettingsService,
    WhatsAppConfigService,
    WhatsAppService,
    WhatsAppWebhookService,
    WhatsAppMarketingService,
  ],
  exports: [
    WhatsAppSettingsService,
    WhatsAppConfigService,
    WhatsAppService,
    WhatsAppWebhookService,
    WhatsAppMarketingService,
  ],
})
export class WhatsAppModule {}
