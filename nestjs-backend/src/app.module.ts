import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { HealthController } from './health.controller';
import { PrismaModule } from './database/prisma.module';
import { LoginApiController } from './login-api.controller';
import { RegisterApiController } from './register-api.controller';
import { AuthModule } from './modules/auth/auth.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { FeedModule } from './modules/feed/feed.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { UploadModule } from './modules/upload/upload.module';
import { VideosModule } from './modules/videos/videos.module';
import { PostsModule } from './modules/posts/posts.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ShortsMusicModule } from './modules/shorts-music/shorts-music.module';
import { PremiumBrokerModule } from './modules/premium-broker/premium-broker.module';
import { BrokersModule } from './modules/brokers/brokers.module';
import { AgentProfileModule } from './modules/agent-profile/agent-profile.module';
import { CompanyAdsModule } from './modules/company-ads/company-ads.module';
import { EmailsModule } from './modules/emails/emails.module';
import { StoriesModule } from './modules/stories/stories.module';
import { ImportsModule } from './modules/imports/imports.module';
import { TiparModule } from './modules/tipar/tipar.module';
import { SocialModule } from './modules/social/social.module';
import { DebugModule } from './modules/debug/debug.module';
import { ShareModule } from './modules/share/share.module';
import { LinkPreviewModule } from './modules/link-preview/link-preview.module';
import { ShareGateVideoModule } from './modules/share-gate-video/share-gate-video.module';
import { BonusCampaignModule } from './modules/bonus-campaign/bonus-campaign.module';
import { RegistrationGateModule } from './modules/registration-gate/registration-gate.module';
import { CreditsModule } from './modules/credits/credits.module';
import { ProfessionalVerificationModule } from './modules/professional-verification/professional-verification.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { PromoProfilesModule } from './modules/promo-profiles/promo-profiles.module';
import { PostSoundsModule } from './modules/post-sounds/post-sounds.module';
import { WebPushModule } from './modules/web-push/web-push.module';
import { MarketingOnboardingModule } from './modules/marketing-onboarding/marketing-onboarding.module';
import { PurchaseAdviceArticlesModule } from './modules/purchase-advice-articles/purchase-advice-articles.module';
import { DeveloperNotesModule } from './modules/developer-notes/developer-notes.module';
import { PortalTestingModule } from './modules/portal-testing/portal-testing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '..', '.env'),
      ],
    }),
    PrismaModule,
    PremiumBrokerModule,
    AuthModule,
    FeedModule,
    PropertiesModule,
    FavoritesModule,
    AdminModule,
    AnalyticsModule,
    UploadModule,
    VideosModule,
    PostsModule,
    MessagesModule,
    ShortsMusicModule,
    BrokersModule,
    AgentProfileModule,
    ProfessionalVerificationModule,
    CompanyAdsModule,
    EmailsModule,
    StoriesModule,
    ImportsModule,
    TiparModule,
    SocialModule,
    DebugModule,
    ShareModule,
    LinkPreviewModule,
    ShareGateVideoModule,
    BonusCampaignModule,
    RegistrationGateModule,
    CreditsModule,
    WhatsAppModule,
    CommunicationModule,
    PromoProfilesModule,
    PostSoundsModule,
    WebPushModule,
    PurchaseAdviceArticlesModule,
    MarketingOnboardingModule,
    DeveloperNotesModule,
    PortalTestingModule,
  ],
  controllers: [HealthController, RegisterApiController, LoginApiController],
})
export class AppModule {}
