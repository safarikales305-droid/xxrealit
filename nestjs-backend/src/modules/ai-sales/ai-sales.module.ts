import { Module, OnModuleInit } from '@nestjs/common';
import { EmailsModule } from '../emails/emails.module';
import { OpenAiModule } from '../openai/openai.module';
import { AiSalesAdminController } from './ai-sales-admin.controller';
import { AiSalesAdminService } from './ai-sales-admin.service';
import { AiSalesAnalysisService } from './ai-sales-analysis.service';
import { AiSalesCampaignService } from './ai-sales-campaign.service';
import { AiSalesCrmService } from './ai-sales-crm.service';
import { AiSalesDashboardService } from './ai-sales-dashboard.service';
import { AiSalesFollowUpService } from './ai-sales-followup.service';
import { AiSalesKnowledgeAdminService } from './ai-sales-knowledge-admin.service';
import { AiSalesKnowledgeService } from './ai-sales-knowledge.service';
import { AiSalesMessageService } from './ai-sales-message.service';
import { AiSalesPromptAdminService } from './ai-sales-prompt-admin.service';
import { AiSalesPermissionsService } from './ai-sales-permissions.service';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AiSalesProspectService } from './ai-sales-prospect.service';
import { AiSalesSeedService } from './ai-sales-seed.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import { AiSalesSuppressionService } from './ai-sales-suppression.service';
import { PartnerSearchService } from './partner-search.service';
import { SearchProvidersEnvService } from './search-providers-env.service';
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
    AiSalesCrmService,
    AiSalesFollowUpService,
    AiSalesPromptAdminService,
    AiSalesKnowledgeAdminService,
    AiSalesKnowledgeService,
    AiSalesPromptResolverService,
    AiSalesAdminService,
    AiSalesSeedService,
    PartnerSearchService,
    SearchProvidersEnvService,
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
