import { Module } from '@nestjs/common';
import { AiSeoAdminController, AiSettingsAdminController, OpenAiAdminController } from './openai-admin.controller';
import { OpenAiConfigService } from './openai-config.service';
import { OpenAiSeoService } from './openai-seo.service';
import { AiProviderService } from './ai-provider.service';
import { OpenAiService } from './openai.service';
import { OpenAiSettingsService } from './openai-settings.service';

@Module({
  controllers: [OpenAiAdminController, AiSettingsAdminController, AiSeoAdminController],
  providers: [OpenAiConfigService, OpenAiSettingsService, OpenAiService, OpenAiSeoService, AiProviderService],
  exports: [OpenAiService, OpenAiSeoService, OpenAiSettingsService, OpenAiConfigService, AiProviderService],
})
export class OpenAiModule {}
