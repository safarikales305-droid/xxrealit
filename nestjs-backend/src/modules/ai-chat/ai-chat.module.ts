import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { OpenAiModule } from '../openai/openai.module';
import { AiChatAdminController } from './ai-chat-admin.controller';
import { AiChatAdminService } from './ai-chat-admin.service';
import { AiChatKnowledgeService } from './ai-chat-knowledge.service';
import { AiChatPromptService } from './ai-chat-prompt.service';
import { AiChatPublicController } from './ai-chat-public.controller';
import { AiChatRateLimitService } from './ai-chat-rate-limit.service';
import { AiChatSettingsService } from './ai-chat-settings.service';
import { AiChatToolsService } from './ai-chat-tools.service';
import { AiChatService } from './ai-chat.service';

@Module({
  imports: [OpenAiModule, PropertiesModule],
  controllers: [AiChatPublicController, AiChatAdminController],
  providers: [
    AiChatService,
    AiChatAdminService,
    AiChatSettingsService,
    AiChatPromptService,
    AiChatKnowledgeService,
    AiChatToolsService,
    AiChatRateLimitService,
  ],
  exports: [AiChatService, AiChatSettingsService],
})
export class AiChatModule {}
