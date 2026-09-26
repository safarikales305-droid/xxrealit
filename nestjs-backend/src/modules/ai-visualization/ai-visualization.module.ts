import { Module } from '@nestjs/common';
import { EmailsModule } from '../emails/emails.module';
import { OpenAiModule } from '../openai/openai.module';
import { AiRenovationService } from './ai-renovation.service';
import { AiVisualizationAdminController } from './ai-visualization-admin.controller';
import { AiVisualizationAuthController } from './ai-visualization-auth.controller';
import { AiVisualizationPublicController, AiRenovationPublicController } from './ai-visualization.controller';
import { AiVisualizationService } from './ai-visualization.service';
import { AiVisualizationSettingsService } from './ai-visualization-settings.service';
import { AiVisualizationStorageService } from './ai-visualization-storage.service';
import { AiVisualizationWatermarkService } from './ai-visualization-watermark.service';
import { AiVisualizationWorkerService } from './ai-visualization-worker.service';
import { OpenAiRenovationImageProvider } from './providers/openai-renovation-image.provider';

import { RenovationPricingService } from './renovation-pricing.service';

@Module({
  imports: [OpenAiModule, EmailsModule],
  controllers: [
    AiVisualizationPublicController,
    AiRenovationPublicController,
    AiVisualizationAuthController,
    AiVisualizationAdminController,
  ],
  providers: [
    AiVisualizationSettingsService,
    AiVisualizationStorageService,
    AiVisualizationWatermarkService,
    OpenAiRenovationImageProvider,
    AiVisualizationService,
    AiVisualizationWorkerService,
    RenovationPricingService,
    AiRenovationService,
  ],
  exports: [AiVisualizationService, AiVisualizationSettingsService],
})
export class AiVisualizationModule {}
