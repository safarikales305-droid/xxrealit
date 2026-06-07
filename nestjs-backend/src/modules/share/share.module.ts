import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ShareDebugController } from './share-debug.controller';
import { ShareMetadataService } from './share-metadata.service';
import { ShareTextsController } from './share.controller';
import { ShareTextsSettingsService } from './share-texts-settings.service';

@Module({
  imports: [PrismaModule],
  controllers: [ShareTextsController, ShareDebugController],
  providers: [ShareTextsSettingsService, ShareMetadataService],
  exports: [ShareTextsSettingsService, ShareMetadataService],
})
export class ShareModule {}
