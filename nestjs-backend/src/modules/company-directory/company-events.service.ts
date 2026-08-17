import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { CompanyDirectorySettingsService } from './company-directory-settings.service';
import { CompanyContentEnrichmentService } from './company-content-enrichment.service';
import { CompanySeoService } from './company-seo.service';
import { CompanySocialPublishService } from './company-social-publish.service';
import { CompanyEngagementCampaignService } from './company-engagement-campaign.service';

export type CompanyDirectoryEvent =
  | 'COMPANY_CREATED'
  | 'COMPANY_WEBSITE_DISCOVERED'
  | 'COMPANY_CONTACT_DISCOVERED'
  | 'COMPANY_ENRICHED'
  | 'COMPANY_SEO_READY'
  | 'COMPANY_REVIEW_PUBLISHED'
  | 'COMPANY_PROFILE_VIEWED'
  | 'COMPANY_CLAIMED';

@Injectable()
export class CompanyEventsService {
  private readonly log = new Logger(CompanyEventsService.name);

  constructor(
    private readonly settings: CompanyDirectorySettingsService,
    @Inject(forwardRef(() => CompanyContentEnrichmentService))
    private readonly enrichment: CompanyContentEnrichmentService,
    private readonly seo: CompanySeoService,
    private readonly social: CompanySocialPublishService,
    private readonly campaigns: CompanyEngagementCampaignService,
  ) {}

  async emitCompanyCreated(companyId: string) {
    this.log.debug(`COMPANY_CREATED ${companyId}`);
  }

  async emitCompanyWebsiteDiscovered(
    companyId: string,
    meta?: { website?: string | null; source?: string | null },
  ) {
    this.log.log(JSON.stringify({ event: 'COMPANY_WEBSITE_DISCOVERED', companyId, ...meta }));
    const cfg = this.settings.getCached();
    if (cfg.seo.enrichAfterWebsiteFound && cfg.seo.aiEnrichmentEnabled) {
      await this.enrichment.enqueueForCompany(companyId, meta?.website ?? undefined);
    }
  }

  async emitCompanyContactDiscovered(
    companyId: string,
    meta?: { email?: string | null; sourceUrl?: string | null },
  ) {
    this.log.log(JSON.stringify({ event: 'COMPANY_CONTACT_DISCOVERED', companyId, ...meta }));
    const cfg = this.settings.getCached();
    if (cfg.email.enrollOnContactFound) {
      await this.campaigns.tryAutoEnroll(companyId);
    }
  }

  async emitCompanyEnriched(companyId: string) {
    this.log.log(JSON.stringify({ event: 'COMPANY_ENRICHED', companyId }));
    await this.seo.evaluateCompany(companyId);
    await this.social.evaluateEligibility(companyId);
    const seoReady = await this.seo.isSeoReady(companyId);
    if (seoReady) {
      await this.emitCompanySeoReady(companyId);
    }
  }

  async emitCompanySeoReady(companyId: string) {
    this.log.log(JSON.stringify({ event: 'COMPANY_SEO_READY', companyId }));
    await this.social.evaluateEligibility(companyId);
  }

  async emitCompanyClaimed(companyId: string) {
    this.log.log(JSON.stringify({ event: 'COMPANY_CLAIMED', companyId }));
    await this.campaigns.stopActiveCampaigns(companyId, 'claimed');
  }
}
