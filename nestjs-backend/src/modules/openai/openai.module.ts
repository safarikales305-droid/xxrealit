import { Module } from '@nestjs/common';
import {
  AiAdminController,
  AiAdminLegacyController,
  AiSeoAdminController,
} from './openai-admin.controller';
import { OpenAiConfigService } from './openai-config.service';
import { OpenAiSeoService } from './openai-seo.service';
import { OpenAiService } from './openai.service';
import { OpenAiSettingsService } from './openai-settings.service';

@Module({
  controllers: [AiAdminController, AiAdminLegacyController, AiSeoAdminController],
  providers: [OpenAiConfigService, OpenAiSettingsService, OpenAiService, OpenAiSeoService],
  exports: [OpenAiService, OpenAiSeoService, OpenAiSettingsService],
})
export class OpenAiModule {}
