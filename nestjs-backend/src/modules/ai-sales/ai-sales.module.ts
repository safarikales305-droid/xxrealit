import { Module, OnModuleInit } from '@nestjs/common';
import { EmailsModule } from '../emails/emails.module';
import { OpenAiModule } from '../openai/openai.module';
import { AiSalesAdminController } from './ai-sales-admin.controller';
import { AiSalesAdminService } from './ai-sales-admin.service';
import { AiSalesAnalysisService } from './ai-sales-analysis.service';
import { AiSalesCampaignService } from './ai-sales-campaign.service';
import { AiSalesDashboardService } from './ai-sales-dashboard.service';
import { AiSalesKnowledgeService } from './ai-sales-knowledge.service';
import { AiSalesMessageService } from './ai-sales-message.service';
import { AiSalesPermissionsService } from './ai-sales-permissions.service';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AiSalesProspectService } from './ai-sales-prospect.service';
import { AiSalesSeedService } from './ai-sales-seed.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import { AiSalesSuppressionService } from './ai-sales-suppression.service';
import { PartnerSearchService } from './partner-search.service';
import { InternalDatabaseSearchProvider } from './providers/internal-database-search.provider';
import { WebSearchProvider } from './providers/web-search.provider';

@Module({
  imports: [OpenAiModule, EmailsModule],
  controllers: [AiSalesAdminController],
  providers: [
    AiSalesSettingsService,
    AiSalesPermissionsService,
    AiSalesSuppressionService,
    AiSalesProspectService,
    AiSalesAnalysisService,
    AiSalesMessageService,
    AiSalesCampaignService,
    AiSalesDashboardService,
    AiSalesKnowledgeService,
    AiSalesPromptResolverService,
    AiSalesAdminService,
    AiSalesSeedService,
    PartnerSearchService,
    InternalDatabaseSearchProvider,
    WebSearchProvider,
  ],
  exports: [AiSalesProspectService, AiSalesMessageService, PartnerSearchService],
})
export class AiSalesModule implements OnModuleInit {
  constructor(private readonly seed: AiSalesSeedService) {}

  async onModuleInit() {
    try {
      await this.seed.seedIfEmpty();
    } catch {
      // DB may not be migrated yet
    }
  }
}
