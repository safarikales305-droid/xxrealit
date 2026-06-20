import { Module, forwardRef } from '@nestjs/common';
import { BonusCampaignModule } from '../bonus-campaign/bonus-campaign.module';
import { PrismaModule } from '../../database/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [PrismaModule, forwardRef(() => BonusCampaignModule), WhatsAppModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
