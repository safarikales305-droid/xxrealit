import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { CompanyDirectoryEntry, CompanySeoPage, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { CompanyAuditService } from './company-audit.service';
import { CompanyDirectorySettingsService } from './company-directory-settings.service';
import { buildCompanySlug, buildLegacyCompanySlug } from './company-directory.slug';
import { CompanySeoPageService } from './company-seo-page.service';
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
} from './company-seo.util';
import type {
  CompanySeoDryRunSummary,
  CompanySeoGenerationFilters,
  CompanySeoRegenerationResult,
} from './company-seo-page.types';

export type CompanySeoRegenerationOptions = {
  regenerateMetadata?: boolean;
  regenerateCanonical?: boolean;
  regenerateStructuredData?: boolean;
  regenerateInternalLinks?: boolean;
  regenerateContent?: boolean;
  regenerateScore?: boolean;
  regenerateRobots?: boolean;
  skipAi?: boolean;
  dryRun?: boolean;
};

const DEFAULT_OPTIONS: Required<CompanySeoRegenerationOptions> = {
  regenerateMetadata: true,
  regenerateCanonical: true,
  regenerateStructuredData: true,
  regenerateInternalLinks: true,
  regenerateContent: true,
  regenerateScore: true,
  regenerateRobots: true,
  skipAi: false,
  dryRun: false,
};

@Injectable()
export class CompanySeoRegenerationService {
  private readonly log = new Logger(CompanySeoRegenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: CompanyDirectorySettingsService,
    private readonly seoPages: CompanySeoPageService,
    private readonly audit: CompanyAuditService,
  ) {}

  buildScopeWhere(filters?: CompanySeoGenerationFilters): Prisma.CompanyDirectoryEntryWhereInput {
    const base = this.seoPages.buildEligibilityWhere(filters);
    const scope = filters?.scope ?? 'all';
    if (filters?.onlyDirty) {
      return { ...base, seoDirty: true };
    }
    switch (scope) {
      case 'missing_page':
        return { ...base, seoPage: { is: null } };
      case 'changed':
        return { ...base, seoDirty: true };
      case 'noindex':
        return {
          ...base,
          OR: [
            { seoPage: { is: { indexable: false } } },
            { seoStatus: 'SEO_NOT_READY' },
            { indexStatus: { not: 'INDEXABLE' } },
          ],
        };
      case 'errors':
        return {
          ...base,
          OR: [
            { seoPage: { is: { status: 'ERROR' } } },
            { seoPage: { is: { status: 'DUPLICATE_CONTENT_REVIEW' } } },
          ],
        };
      case 'all':
      default:
        return base;
    }
  }

  async dryRun(filters?: CompanySeoGenerationFilters): Promise<CompanySeoDryRunSummary> {
    const where = this.buildScopeWhere(filters);
    const companies = await this.prisma.companyDirectoryEntry.findMany({
      where,
      include: { seoPage: true },
      orderBy: { updatedAt: 'desc' },
    });

    const summary: CompanySeoDryRunSummary = {
      total: companies.length,
      ok: 0,
      badTitle: 0,
      missingDescription: 0,
      badCanonical: 0,
      potentialDuplicates: 0,
      noindex: 0,
      missingStructuredData: 0,
      missingSitemap: 0,
      duplicateIco: 0,
    };

    const icoCounts = new Map<string, number>();
    for (const c of companies) {
      icoCounts.set(c.ico, (icoCounts.get(c.ico) ?? 0) + 1);
    }
    summary.duplicateIco = [...icoCounts.values()].filter((n) => n > 1).length;

    const base = resolveFrontendUrl().replace(/\/+$/, '');
    for (const company of companies) {
      const issues = this.analyzeCompany(company, company.seoPage, base);
      if (issues.badTitle) summary.badTitle++;
      if (issues.missingDescription) summary.missingDescription++;
      if (issues.badCanonical) summary.badCanonical++;
      if (issues.noindex) summary.noindex++;
      if (issues.missingStructuredData) summary.missingStructuredData++;
      if (issues.missingSitemap) summary.missingSitemap++;
      if (issues.potentialDuplicate) summary.potentialDuplicates++;
      if (!issues.hasAnyIssue) summary.ok++;
    }

    return summary;
  }

  async regenerateCompany(
    companyId: string,
    options?: CompanySeoRegenerationOptions,
  ): Promise<CompanySeoRegenerationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      include: {
        seoPage: true,
        reviews: { where: { status: 'PUBLISHED' }, take: 5, orderBy: { publishedAt: 'desc' } },
      },
    });
    if (!company) return { action: 'error', companyId, error: 'COMPANY_NOT_FOUND' };
    if (!this.seoPages.isEligible(company)) {
      return { action: 'skipped', companyId, reason: 'INELIGIBLE' };
    }

    const duplicateIco = await this.prisma.companyDirectoryEntry.count({
      where: { ico: company.ico, id: { not: company.id } },
    });
    if (duplicateIco > 0) {
      return { action: 'skipped', companyId, reason: 'DUPLICATE_COMPANY' };
    }

    const inputHash = this.computeInputHash(company);
    const skipAi =
      opts.skipAi || (company.seoInputHash === inputHash && Boolean(company.seoPage?.shortDescription));

    const canonicalSlug = buildCompanySlug(company.name, company.ico, company.categories[0] ?? null);
    const legacySlug = buildLegacyCompanySlug(company.name, company.ico, company.categories[0] ?? null);
    const slugChanged = company.slug !== canonicalSlug;
    const previousSlugs = new Set(company.previousSlugs);
    if (slugChanged) {
      previousSlugs.add(company.slug);
      if (legacySlug !== canonicalSlug && legacySlug !== company.slug) {
        previousSlugs.add(legacySlug);
      }
    }

    const enrichment = (company.enrichmentData ?? null) as CompanyEnrichmentPayload | null;
    const services = extractServicesFromEnrichment(enrichment);
    const title = buildCompanySeoTitle(company);
    const metaDescription = buildCompanyMetaDescription({ ...company, services });
    const hasUniqueContent = Boolean(
      company.shortDescription?.trim() || company.description?.trim() || company.seoPage?.shortDescription,
    );
    const score = computeSeoQualityScore({
      ...company,
      serviceCount: services.length,
      hasUniqueTitle: Boolean(title),
      hasUniqueDescription: Boolean(metaDescription),
    });
    const indexable = shouldIndexCompany(score, hasUniqueContent, company.seoPage?.status);

    if (opts.dryRun) {
      return { action: 'unchanged', companyId, slug: canonicalSlug };
    }

    let contentChanged = false;
    if (opts.regenerateContent && !skipAi) {
      const gen = await this.seoPages.generateForCompany(companyId, {
        forceUpdate: true,
        skipEnrichmentWait: true,
      });
      if (gen.action === 'created' || gen.action === 'updated') {
        contentChanged = true;
      }
    }

    const base = resolveFrontendUrl().replace(/\/+$/, '');
    const canonicalUrl = `${base}/firmy/${canonicalSlug}`;
    const socialLinks = enrichment?.socialLinks?.map((s) => s.value).filter(Boolean) ?? [];
    const jsonLd = opts.regenerateStructuredData
      ? [
          buildCompanyJsonLd(company, canonicalUrl, socialLinks),
          buildCompanyBreadcrumbJsonLd(
            buildCompanyBreadcrumbs(company, base)
              .filter((c) => c.href)
              .map((c) => ({ name: c.name, url: c.href })),
          ),
        ]
      : null;

    const entryUpdate: Prisma.CompanyDirectoryEntryUpdateInput = {};
    if (opts.regenerateCanonical && slugChanged) {
      entryUpdate.slug = canonicalSlug;
      entryUpdate.previousSlugs = [...previousSlugs];
    }
    if (opts.regenerateMetadata) {
      entryUpdate.seoTitle = title;
      entryUpdate.seoDescription = metaDescription;
    }
    if (opts.regenerateScore) {
      entryUpdate.seoQualityScore = score;
      entryUpdate.seoStatus = indexable ? 'SEO_READY' : 'SEO_NOT_READY';
      entryUpdate.indexStatus = indexable ? 'INDEXABLE' : 'UNKNOWN';
    }
    if (opts.regenerateRobots) {
      entryUpdate.seoStatus = indexable ? 'SEO_READY' : 'SEO_NOT_READY';
      entryUpdate.indexStatus = indexable ? 'INDEXABLE' : 'UNKNOWN';
    }
    entryUpdate.seoInputHash = inputHash;
    entryUpdate.seoDirty = false;
    entryUpdate.seoLastSignificantChangeAt = new Date();

    const hadChanges =
      slugChanged ||
      company.seoTitle !== title ||
      company.seoDescription !== metaDescription ||
      company.seoQualityScore !== score ||
      company.seoInputHash !== inputHash ||
      contentChanged;

    if (Object.keys(entryUpdate).length > 0) {
      await this.prisma.companyDirectoryEntry.update({
        where: { id: companyId },
        data: entryUpdate,
      });
    }

    let seoPageId = company.seoPage?.id;
    if (company.seoPage) {
      const pageUpdate: Prisma.CompanySeoPageUpdateInput = {};
      if (opts.regenerateMetadata) {
        pageUpdate.title = title;
        pageUpdate.metaDescription = metaDescription;
      }
      if (opts.regenerateCanonical) pageUpdate.slug = canonicalSlug;
      if (opts.regenerateScore) {
        pageUpdate.seoScore = score;
        pageUpdate.indexable = indexable;
        pageUpdate.status = indexable ? 'READY' : 'DRAFT';
      }
      if (Object.keys(pageUpdate).length > 0) {
        await this.prisma.companySeoPage.update({
          where: { id: company.seoPage.id },
          data: pageUpdate,
        });
      }
    } else if (opts.regenerateMetadata || opts.regenerateScore) {
      const created = await this.prisma.companySeoPage.create({
        data: {
          companyId,
          slug: canonicalSlug,
          title,
          metaDescription,
          shortDescription: company.shortDescription,
          longDescription: company.description,
          seoScore: score,
          status: indexable ? 'READY' : 'DRAFT',
          indexable,
          generatedAt: new Date(),
        },
      });
      seoPageId = created.id;
    }

    if (hadChanges) {
      await this.audit.log({
        companyId,
        action: 'SEO_UPDATE',
        message: `SEO regenerace (score ${score}, indexable ${indexable})`,
        meta: { score, indexable, slug: canonicalSlug, skipAi },
      });
      return {
        action: 'updated',
        companyId,
        seoPageId,
        slug: canonicalSlug,
        score,
        indexable,
      };
    }

    return { action: 'unchanged', companyId, slug: canonicalSlug };
  }

  computeInputHash(company: CompanyDirectoryEntry): string {
    const payload = {
      name: company.name,
      ico: company.ico,
      city: company.city,
      region: company.region,
      street: company.street,
      website: company.website,
      phone: company.phone,
      email: company.email ?? company.verifiedBusinessEmail,
      shortDescription: company.shortDescription,
      description: company.description,
      categories: company.categories,
      enrichmentData: company.enrichmentData,
      xxrealitReviewCount: company.xxrealitReviewCount,
      profileStatus: company.profileStatus,
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
  }

  private analyzeCompany(
    company: CompanyDirectoryEntry,
    seoPage: CompanySeoPage | null,
    base: string,
  ) {
    const canonicalSlug = buildCompanySlug(company.name, company.ico, company.categories[0] ?? null);
    const expectedTitle = buildCompanySeoTitle(company);
    const expectedDescription = buildCompanyMetaDescription(company);
    const canonicalUrl = `${base}/firmy/${canonicalSlug}`;
    const actualTitle = seoPage?.title ?? company.seoTitle;
    const actualDescription = seoPage?.metaDescription ?? company.seoDescription;
    const indexable = seoPage?.indexable ?? company.seoStatus === 'SEO_READY';

    const badTitle = !actualTitle || !actualTitle.startsWith(company.name);
    const missingDescription = !actualDescription?.trim();
    const badCanonical = company.slug !== canonicalSlug;
    const noindex = !indexable;
    const missingStructuredData = !this.settings.getCached().seo.generateJsonLd;
    const missingSitemap = indexable && company.seoStatus !== 'SEO_READY';
    const potentialDuplicate = Boolean(seoPage?.similarityScore && seoPage.similarityScore > 0.82);

    const hasAnyIssue =
      badTitle || missingDescription || badCanonical || noindex || missingStructuredData || missingSitemap;

    return {
      badTitle,
      missingDescription,
      badCanonical,
      noindex,
      missingStructuredData,
      missingSitemap,
      potentialDuplicate,
      hasAnyIssue,
      canonicalUrl,
      expectedTitle,
      expectedDescription,
    };
  }
}
