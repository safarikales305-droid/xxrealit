import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertiesModule } from '../properties/properties.module';
import { OpenAiModule } from '../openai/openai.module';
import { ShortsMusicModule } from '../shorts-music/shorts-music.module';
import { SocialModule } from '../social/social.module';
import { YouTubeModule } from '../social/youtube/youtube.module';
import { AiInfluencerAdminController } from './ai-influencer-admin.controller';
import { AiInfluencerJobService } from './ai-influencer-job.service';
import { AiInfluencerProviderRegistry } from './ai-influencer-provider.registry';
import { AiInfluencerPublishService } from './ai-influencer-publish.service';
import { AiInfluencerSceneCompositorService } from './ai-influencer-scene-compositor.service';
import { AiInfluencerRenderService } from './ai-influencer-render.service';
import { AiInfluencerRenderValidatorService } from './ai-influencer-render-validator.service';
import { AiInfluencerSettingsService } from './ai-influencer-settings.service';
import { AiInfluencerSubtitleService } from './ai-influencer-subtitle.service';
import { AiInfluencerAutoService } from './ai-influencer-auto.service';
import { AiInfluencerWorkerService } from './ai-influencer-worker.service';
import { ProviderGenerationService } from './provider-generation.service';
import { ArticleMediaProvider } from './providers/article-media.provider';
import { DIdAvatarProvider } from './providers/did-avatar.provider';
import { ElevenLabsVoiceProvider } from './providers/elevenlabs-voice.provider';
import { HeyGenAvatarProvider } from './providers/heygen-avatar.provider';
import { HeyGenVideoAgentProvider } from './providers/heygen-video-agent.provider';
import { OpenAiScriptProvider } from './providers/openai-script.provider';
import { PropertyMediaProvider } from './providers/property-media.provider';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PropertiesModule),
    OpenAiModule,
    ShortsMusicModule,
    forwardRef(() => SocialModule),
    YouTubeModule,
  ],
  controllers: [AiInfluencerAdminController],
  providers: [
    AiInfluencerSettingsService,
    AiInfluencerProviderRegistry,
    ElevenLabsVoiceProvider,
    HeyGenAvatarProvider,
    HeyGenVideoAgentProvider,
    DIdAvatarProvider,
    OpenAiScriptProvider,
    ArticleMediaProvider,
    PropertyMediaProvider,
    ProviderGenerationService,
    AiInfluencerSubtitleService,
    AiInfluencerSceneCompositorService,
    AiInfluencerRenderValidatorService,
    AiInfluencerRenderService,
    AiInfluencerPublishService,
    AiInfluencerJobService,
    AiInfluencerWorkerService,
    AiInfluencerAutoService,
  ],
  exports: [AiInfluencerJobService, AiInfluencerSettingsService, AiInfluencerAutoService],
})
export class AiInfluencerModule {}
