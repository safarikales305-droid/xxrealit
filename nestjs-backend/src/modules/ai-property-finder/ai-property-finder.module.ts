import { Module } from '@nestjs/common';
import { AiSalesModule } from '../ai-sales/ai-sales.module';
import { OpenAiModule } from '../openai/openai.module';
import { PropertiesModule } from '../properties/properties.module';
import { AiPropertyFinderAdminController } from './ai-property-finder-admin.controller';
import { AiPropertyFinderPublicController } from './ai-property-finder.controller';
import { AiPropertyFinderQueryParserService } from './ai-property-finder-query-parser.service';
import { AiPropertyFinderSettingsService } from './ai-property-finder-settings.service';
import { AiPropertyFinderService } from './ai-property-finder.service';
import { SearchEnginePropertyProvider } from './providers/search-engine-property.provider';
import { XxRealitPropertyProvider } from './providers/xxrealit-property.provider';

@Module({
  imports: [PropertiesModule, OpenAiModule, AiSalesModule],
  controllers: [AiPropertyFinderPublicController, AiPropertyFinderAdminController],
  providers: [
    AiPropertyFinderSettingsService,
    AiPropertyFinderQueryParserService,
    XxRealitPropertyProvider,
    SearchEnginePropertyProvider,
    AiPropertyFinderService,
  ],
  exports: [AiPropertyFinderService, AiPropertyFinderSettingsService],
})
export class AiPropertyFinderModule {}
