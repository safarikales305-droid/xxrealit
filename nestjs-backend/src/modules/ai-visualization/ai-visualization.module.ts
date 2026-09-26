import { Module } from '@nestjs/common';
import { OpenAiModule } from '../openai/openai.module';
import { AiVisualizationAdminController } from './ai-visualization-admin.controller';
import { AiVisualizationAuthController } from './ai-visualization-auth.controller';
import { AiVisualizationPublicController } from './ai-visualization.controller';
import { AiVisualizationService } from './ai-visualization.service';
import { AiVisualizationSettingsService } from './ai-visualization-settings.service';
import { AiVisualizationStorageService } from './ai-visualization-storage.service';
import { AiVisualizationWatermarkService } from './ai-visualization-watermark.service';
import { AiVisualizationWorkerService } from './ai-visualization-worker.service';
import { OpenAiRenovationImageProvider } from './providers/openai-renovation-image.provider';

@Module({
  imports: [OpenAiModule],
  controllers: [
    AiVisualizationPublicController,
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
  ],
  exports: [AiVisualizationService, AiVisualizationSettingsService],
})
export class AiVisualizationModule {}
