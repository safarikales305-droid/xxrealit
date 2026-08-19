import { Injectable, Logger } from '@nestjs/common';
import type { CompanyDirectoryEntry, CompanySeoPage } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { CompanyAuditService } from './company-audit.service';
import { CompanyDirectorySettingsService } from './company-directory-settings.service';
import type { CompanyEnrichmentPayload } from './company-sourced-field.types';
import {
  buildCompanyBreadcrumbJsonLd,
  buildCompanyBreadcrumbs,
  buildCompanyJsonLd,
  buildCompanyMetaDescription,
  buildCompanySeoTitle,
  computeSeoQualityScore,
  extractServicesFromEnrichment,
  shouldIndexCompany,
  textSimilarity,
} from './company-seo.util';

const DUPLICATE_THRESHOLD = 0.82;

@Injectable()
export class CompanySeoService {
  private readonly log = new Logger(CompanySeoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: CompanyDirectorySettingsService,
    private readonly audit: CompanyAuditService,
  ) {}

  buildCanonicalUrl(slug: string): string {
    const base = resolveFrontendUrl().replace(/\/+$/, '');
    return `${base}/firmy/${slug}`;
  }

  async isSeoReady(companyId: string): Promise<boolean> {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      include: { seoPage: true },
    });
    if (!company) return false;
    if (company.seoPage?.indexable) return true;
    return company.seoStatus === 'SEO_READY';
  }

  async evaluateCompany(companyId: string) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      include: { seoPage: true },
    });
    if (!company) return null;

    const enrichment = (company.enrichmentData ?? null) as CompanyEnrichmentPayload | null;
    const services = extractServicesFromEnrichment(enrichment);
    const seoTitle = company.seoTitle ?? buildCompanySeoTitle(company);
    const seoDescription =
      company.seoDescription ?? buildCompanyMetaDescription({ ...company, services });
    let shortDescription = company.shortDescription;
    let description = company.description;

    if (description) {
      const dup = await this.findDuplicateDescription(company.id, description);
      if (dup) {
        this.log.warn(`Duplicate description detected for ${company.id}, shortening`);
        description = description.slice(0, Math.max(200, Math.floor(description.length * 0.6)));
      }
    }

    const score = computeSeoQualityScore({
      ...company,
      serviceCount: services.length,
      hasUniqueTitle: Boolean(seoTitle),
      hasUniqueDescription: Boolean(seoDescription),
    });
    const hasUniqueContent = Boolean(shortDescription?.trim() || description?.trim());
    const indexable = shouldIndexCompany(score, hasUniqueContent, company.seoPage?.status);
    const seoReady = indexable;

    const updated = await this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: {
        seoQualityScore: score,
        seoStatus: seoReady ? 'SEO_READY' : 'SEO_NOT_READY',
        indexStatus: seoReady ? 'INDEXABLE' : 'UNKNOWN',
        seoTitle,
        seoDescription,
        shortDescription,
        description,
        seoKeywords: company.seoKeywords.length
          ? company.seoKeywords
          : services.slice(0, 8).map((s) => {
              const city = company.city?.trim();
              return city ? `${s} ${city}` : s;
            }),
        seoLastSignificantChangeAt: new Date(),
        profileCompletenessScore: score,
      },
    });

    if (company.seoPage) {
      await this.prisma.companySeoPage.update({
        where: { id: company.seoPage.id },
        data: {
          seoScore: score,
          indexable,
          status: indexable ? 'READY' : 'DRAFT',
          title: seoTitle,
          metaDescription: seoDescription,
        },
      });
    }

    await this.audit.log({
      companyId,
      action: 'SEO_UPDATE',
      message: `SEO score ${score}, status ${updated.seoStatus}`,
      meta: { score, seoStatus: updated.seoStatus, indexable },
    });

    return updated;
  }

  private async findDuplicateDescription(companyId: string, description: string) {
    const peers = await this.prisma.companyDirectoryEntry.findMany({
      where: {
        id: { not: companyId },
        description: { not: null },
        contentEnrichedAt: { not: null },
      },
      select: { id: true, description: true },
      take: 30,
      orderBy: { contentEnrichedAt: 'desc' },
    });
    return peers.find(
      (p) => p.description && textSimilarity(description, p.description) >= DUPLICATE_THRESHOLD,
    );
  }

  buildPublicSeoMeta(
    company: CompanyDirectoryEntry & { seoPage?: CompanySeoPage | null },
  ) {
    const cfg = this.settings.getCached();
    const canonical = this.buildCanonicalUrl(company.slug);
    const enrichment = (company.enrichmentData ?? null) as CompanyEnrichmentPayload | null;
    const socialLinks = enrichment?.socialLinks?.map((s) => s.value).filter(Boolean) ?? [];
    const seoPage = company.seoPage;
    const title = seoPage?.title ?? company.seoTitle ?? buildCompanySeoTitle(company);
    const description =
      seoPage?.metaDescription ?? company.seoDescription ?? buildCompanyMetaDescription(company);
    const score = seoPage?.seoScore ?? company.seoQualityScore;
    const hasUniqueContent = Boolean(
      seoPage?.shortDescription?.trim() ||
        company.shortDescription?.trim() ||
        company.description?.trim(),
    );
    const indexable =
      seoPage != null
        ? seoPage.indexable && seoPage.status === 'READY'
        : shouldIndexCompany(score, hasUniqueContent, null) && company.seoStatus === 'SEO_READY';
    const robots =
      cfg.seo.noindexWeakProfiles && !indexable ? 'noindex, follow' : 'index, follow';

    const base = resolveFrontendUrl().replace(/\/+$/, '');
    const breadcrumbs = buildCompanyBreadcrumbs(company, base);
    const jsonLd = cfg.seo.generateJsonLd
      ? [
          buildCompanyJsonLd(company, canonical, socialLinks),
          buildCompanyBreadcrumbJsonLd(
            breadcrumbs.filter((c) => c.href).map((c) => ({ name: c.name, url: c.href })),
          ),
        ]
      : null;

    return {
      title,
      description,
      canonical,
      robots,
      keywords: company.seoKeywords,
      seoQualityScore: score,
      seoStatus: company.seoStatus,
      indexStatus: indexable ? 'INDEXABLE' : company.indexStatus,
      indexable,
      breadcrumbs,
      jsonLd,
      h1: company.name,
    };
  }

  async getSitemapEntries(origin: string, page = 1, pageSize = 5000) {
    const cfg = this.settings.getCached();
    if (!cfg.seo.addSeoReadyToSitemap) return { entries: [], total: 0 };

    const where = {
      publicProfile: true,
      hidden: false,
      seoPage: {
        is: {
          indexable: true,
          status: 'READY' as const,
        },
      },
    };
    const [total, rows] = await Promise.all([
      this.prisma.companyDirectoryEntry.count({ where }),
      this.prisma.companyDirectoryEntry.findMany({
        where,
        select: {
          slug: true,
          seoLastSignificantChangeAt: true,
          updatedAt: true,
          seoPage: { select: { updatedAt: true } },
        },
        orderBy: { seoLastSignificantChangeAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const base = origin.replace(/\/+$/, '');
    const entries = rows.map((r) => ({
      loc: `${base}/firmy/${r.slug}`,
      lastmod: (
        r.seoLastSignificantChangeAt ??
        r.seoPage?.updatedAt ??
        r.updatedAt
      ).toISOString(),
      changefreq: 'weekly' as const,
      priority: 0.55,
    }));
    return { entries, total };
  }
}
