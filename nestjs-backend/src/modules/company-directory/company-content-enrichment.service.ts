import { Injectable, Logger, Inject, forwardRef, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CompanyContentEnrichmentJobStatus,
  CompanyEnrichmentStatus,
  type CompanyDirectoryEntry,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CompanyWebsiteCrawlerService } from '../ai-sales/company-website-crawler.service';
import { OpenAiService } from '../openai/openai.service';
import { CompanyAuditService } from './company-audit.service';
import { CompanyDirectorySettingsService } from './company-directory-settings.service';
import { CompanyEventsService } from './company-events.service';
import { ARES_WORKER_TICK_MS } from './company-directory.constants';
import {
  ENRICHMENT_CRAWL_PATHS,
  extractHeadings,
  extractListItems,
  guessServiceKeywords,
  stripHtmlToText,
} from './company-content-extract.util';
import { sourced, type CompanyEnrichmentPayload } from './company-sourced-field.types';
import { CATEGORY_LABELS } from './company-directory.constants';

const MAX_CONCURRENT = 1;
const ENRICHMENT_DELAY_MS = 4000;

@Injectable()
export class CompanyContentEnrichmentService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanyContentEnrichmentService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawler: CompanyWebsiteCrawlerService,
    private readonly openai: OpenAiService,
    private readonly settings: CompanyDirectorySettingsService,
    @Inject(forwardRef(() => CompanyEventsService))
    private readonly events: CompanyEventsService,
    private readonly audit: CompanyAuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueueForCompany(companyId: string, websiteUrl?: string) {
    const cfg = this.settings.getCached();
    if (!cfg.seo.aiEnrichmentEnabled) return null;

    const existingPending = await this.prisma.companyContentEnrichmentJob.findFirst({
      where: {
        companyId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
    });
    if (existingPending) return existingPending;

    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } });
    const url = websiteUrl ?? company?.website;
    if (!url) return null;

    return this.prisma.companyContentEnrichmentJob.create({
      data: {
        companyId,
        websiteUrl: url,
        status: CompanyContentEnrichmentJobStatus.PENDING,
      },
    });
  }

  private async tick() {
    if (this.processing) return;
    const cfg = this.settings.getCached();
    if (!cfg.seo.aiEnrichmentEnabled) return;

    this.processing = true;
    try {
      const jobs = await this.prisma.companyContentEnrichmentJob.findMany({
        where: { status: CompanyContentEnrichmentJobStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        take: MAX_CONCURRENT,
      });
      for (const job of jobs) {
        await this.processJob(job.id);
        await new Promise((r) => setTimeout(r, ENRICHMENT_DELAY_MS));
      }
    } finally {
      this.processing = false;
    }
  }

  async processJob(jobId: string) {
    const job = await this.prisma.companyContentEnrichmentJob.findUnique({
      where: { id: jobId },
      include: { company: true },
    });
    if (!job || job.status !== 'PENDING') return;

    await this.prisma.companyContentEnrichmentJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      await this.enrichCompany(job.company, job.websiteUrl ?? job.company.website ?? '');
      await this.prisma.companyContentEnrichmentJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', finishedAt: new Date(), error: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.companyContentEnrichmentJob.update({
        where: { id: jobId },
        data: {
          status: job.attempts >= 2 ? 'FAILED' : 'PENDING',
          error: message,
          finishedAt: job.attempts >= 2 ? new Date() : null,
        },
      });
      await this.prisma.companyDirectoryEntry.update({
        where: { id: job.companyId },
        data: { contentEnrichmentError: message },
      });
    }
  }

  async enrichCompany(company: CompanyDirectoryEntry, websiteUrl: string) {
    const { pages, error } = await this.crawler.crawl(ENRICHMENT_CRAWL_PATHS, websiteUrl);
    if (!pages.length) {
      throw new Error(error ?? 'WEBSITE_UNAVAILABLE');
    }

    const allHtml = pages.map((p) => p.html).join('\n');
    const headings = pages.flatMap((p) => extractHeadings(p.html));
    const listItems = pages.flatMap((p) => extractListItems(p.html));
    const services = guessServiceKeywords(headings, listItems);
    const sourceUrl = pages[0]?.url ?? websiteUrl;
    const plainText = pages
      .map((p) => stripHtmlToText(p.html))
      .join('\n')
      .slice(0, 12000);

    const enrichmentData: CompanyEnrichmentPayload = {
      services: services.map((s) => sourced(s, sourceUrl)),
      specializations: services.slice(0, 5).map((s) => sourced(s, sourceUrl, 0.75)),
    };

    const aiCopy = await this.generateAiCopy(company, plainText, services);
    const refreshDays = this.settings.getCached().seo.refreshDays;
    const refreshDue = new Date();
    refreshDue.setDate(refreshDue.getDate() + refreshDays);

    const enrichmentStatus: CompanyEnrichmentStatus =
      services.length && (aiCopy.shortDescription || aiCopy.description)
        ? 'ENRICHED'
        : 'PARTIALLY_ENRICHED';

    const updated = await this.prisma.companyDirectoryEntry.update({
      where: { id: company.id },
      data: {
        shortDescription: aiCopy.shortDescription ?? company.shortDescription,
        description: aiCopy.description ?? company.description,
        enrichmentData: enrichmentData as object,
        enrichmentStatus,
        contentEnrichedAt: new Date(),
        contentRefreshDueAt: refreshDue,
        contentEnrichmentError: null,
        aiSummary: aiCopy.description?.slice(0, 500) ?? company.aiSummary,
      },
    });

    await this.audit.log({
      companyId: company.id,
      action: 'CONTENT_ENRICHMENT',
      message: `AI profil vytvořen (${enrichmentStatus})`,
      meta: { services: services.length, websiteUrl },
    });

    await this.events.emitCompanyEnriched(updated.id);
    return updated;
  }

  private async generateAiCopy(
    company: CompanyDirectoryEntry,
    plainText: string,
    services: string[],
  ): Promise<{ shortDescription?: string; description?: string }> {
    const category = company.categories[0];
    const categoryLabel = category ? CATEGORY_LABELS[category] : 'firma';
    const facts = [
      `Název: ${company.name}`,
      company.city ? `Město: ${company.city}` : null,
      `Obor: ${categoryLabel}`,
      services.length ? `Služby: ${services.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const status = await this.openai.getStatus();
    if (!status.enabled || !status.configured) {
      return this.ruleBasedCopy(company, services, plainText);
    }

    try {
      const result = await this.openai.complete({
        feature: 'seo_ai_generate',
        systemPrompt: `Jsi editor firemních profilů pro portál XXREALIT. Piš česky, věcně, bez marketingových klišé.
Nikdy netvrď „nejlepší“, „lídr trhu“, „tisíce zákazníků“ ani roky zkušeností bez důkazu ve zdroji.
Nepřepisuj dlouhé pasáže z webu — použij jen ověřená fakta vlastními slovy.
Vrať JSON: { "shortDescription": "160-300 znaků", "description": "500-1500 slov pokud je dost dat, jinak kratší" }`,
        userPrompt: `Fakta o firmě:\n${facts}\n\nVeřejný text z webu (zkráceno):\n${plainText.slice(0, 6000)}`,
        jsonMode: true,
        maxOutputTokens: 2500,
      });
      const parsed = JSON.parse(result.text) as {
        shortDescription?: string;
        description?: string;
      };
      return {
        shortDescription: parsed.shortDescription?.trim(),
        description: parsed.description?.trim(),
      };
    } catch (err) {
      this.log.warn(`AI copy failed for ${company.id}: ${err instanceof Error ? err.message : err}`);
      return this.ruleBasedCopy(company, services, plainText);
    }
  }

  private ruleBasedCopy(
    company: CompanyDirectoryEntry,
    services: string[],
    plainText: string,
  ): { shortDescription?: string; description?: string } {
    const city = company.city?.trim();
    const servicePart = services.slice(0, 3).join(', ');
    const short = city && servicePart
      ? `${company.name} působí v ${city} a nabízí ${servicePart}.`
      : `${company.name} je zapsaná v registru firem XXREALIT.`;
    const snippet = plainText.slice(0, 800).trim();
    const description = snippet
      ? `${company.name}${city ? ` sídlí v ${city}` : ''}. ${snippet}`
      : short;
    return {
      shortDescription: short.slice(0, 300),
      description: description.slice(0, 2000),
    };
  }

  async manualEnrich(companyId: string) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } });
    if (!company?.website) throw new Error('Firma nemá web.');
    return this.enrichCompany(company, company.website);
  }
}
