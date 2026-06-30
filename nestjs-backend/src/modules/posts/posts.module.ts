import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BonusCampaignModule } from '../bonus-campaign/bonus-campaign.module';
import { PrismaModule } from '../../database/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EmailsModule } from '../emails/emails.module';
import { SocialModule } from '../social/social.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => BonusCampaignModule),
    WhatsAppModule,
    forwardRef(() => SocialModule),
    forwardRef(() => AuthModule),
    EmailsModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
