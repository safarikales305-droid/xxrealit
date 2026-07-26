import { Module } from '@nestjs/common';
import { AiSeoAdminController, OpenAiAdminController } from './openai-admin.controller';
import { OpenAiConfigService } from './openai-config.service';
import { OpenAiSeoService } from './openai-seo.service';
import { OpenAiService } from './openai.service';
import { OpenAiSettingsService } from './openai-settings.service';

@Module({
  controllers: [OpenAiAdminController, AiSeoAdminController],
  providers: [OpenAiConfigService, OpenAiSettingsService, OpenAiService, OpenAiSeoService],
  exports: [OpenAiService, OpenAiSeoService, OpenAiSettingsService, OpenAiConfigService],
})
export class OpenAiModule {}
