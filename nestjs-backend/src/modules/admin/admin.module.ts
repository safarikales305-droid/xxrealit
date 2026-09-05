import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { SrealityImportAdminController } from './sreality-import-admin.controller';
import { AdminSeedService } from './admin-seed.service';
import { AdminService } from './admin.service';
import { AgentProfileModule } from '../agent-profile/agent-profile.module';
import { ImportsModule } from '../imports/imports.module';
import { PropertiesModule } from '../properties/properties.module';
import { AiInfluencerModule } from '../ai-influencer/ai-influencer.module';
import { TiparModule } from '../tipar/tipar.module';
import { ShareModule } from '../share/share.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ProfessionalVerificationModule } from '../professional-verification/professional-verification.module';
import { SocialModule } from '../social/social.module';
import { CreditsModule } from '../credits/credits.module';
@Module({
  imports: [
    AuthModule,
    CreditsModule,
    AgentProfileModule,
    ProfessionalVerificationModule,
    forwardRef(() => SocialModule),
    ImportsModule,
    PropertiesModule,
    forwardRef(() => AiInfluencerModule),
    TiparModule,
    ShareModule,
    WhatsAppModule,
  ],
  controllers: [AdminController, SrealityImportAdminController],
  providers: [AdminService, AdminSeedService],
})
export class AdminModule {}
