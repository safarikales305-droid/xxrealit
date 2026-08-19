import { createHash } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CompanyDirectoryEntry, CompanySeoPageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { CompanyAuditService } from './company-audit.service';
import { CompanyContentEnrichmentService } from './company-content-enrichment.service';
import { CATEGORY_LABELS } from './company-directory.constants';
import { CompanyDirectorySettingsService } from './company-directory-settings.service';
import { CompanySeoService } from './company-seo.service';
import type { CompanyEnrichmentPayload } from './company-sourced-field.types';
import {
  buildCompanyMetaDescription,
  buildCompanySeoTitle,
  computeSeoQualityScore,
  extractServicesFromEnrichment,
  shouldIndexCompany,
  textSimilarity,
} from './company-seo.util';
import type {
  CompanySeoGenerationFilters,
  CompanySeoGenerationResult,
  CompanySeoPageContent,
} from './company-seo-page.types';

const DUPLICATE_THRESHOLD = 0.82;
const ENRICHMENT_STALE_DAYS = 90;

@Injectable()
export class CompanySeoPageService {
  private readonly log = new Logger(CompanySeoPageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly settings: CompanyDirectorySettingsService,
    private readonly enrichment: CompanyContentEnrichmentService,
    private readonly seo: CompanySeoService,
    private readonly audit: CompanyAuditService,
  ) {}

  isEligible(company: Pick<
    CompanyDirectoryEntry,
    'publicProfile' | 'hidden' | 'inLiquidation' | 'inactive' | 'dissolved'
  >): boolean {
    return (
      company.publicProfile &&
      !company.hidden &&
      !company.inLiquidation &&
      !company.inactive &&
      !company.dissolved
    );
  }

  buildEligibilityWhere(filters?: CompanySeoGenerationFilters): Prisma.CompanyDirectoryEntryWhereInput {
    const where: Prisma.CompanyDirectoryEntryWhereInput = {
      publicProfile: true,
      hidden: false,
      inLiquidation: false,
      inactive: false,
      dissolved: false,
    };
    if (filters?.category) where.categories = { has: filters.category };
    if (filters?.region?.trim()) where.region = { equals: filters.region.trim(), mode: 'insensitive' };
    if (filters?.city?.trim()) where.city = { equals: filters.city.trim(), mode: 'insensitive' };
    if (filters?.seoStatus) where.seoStatus = filters.seoStatus as Prisma.EnumCompanySeoStatusFilter;
    if (filters?.hasWebsite) where.website = { not: null };
    if (filters?.hasEmail) {
      where.OR = [{ email: { not: null } }, { verifiedBusinessEmail: { not: null } }];
    }
    if (filters?.claimed) where.profileStatus = { in: ['CLAIMED', 'VERIFIED'] };
    if (filters?.hasReviews) where.xxrealitReviewCount = { gt: 0 };
    if (filters?.indexStatus) where.indexStatus = filters.indexStatus as Prisma.EnumCompanyIndexStatusFilter;
    if (filters?.onlyMissing) where.seoPage = { is: null };
    if (filters?.onlyOutdated) where.seoPage = { is: { status: 'SEO_OUTDATED' } };
    return where;
  }

  async listAdmin(query: {
    page?: number;
    pageSize?: number;
    q?: string;
    category?: string;
    region?: string;
    city?: string;
    status?: string;
    indexable?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
    const where: Prisma.CompanySeoPageWhereInput = {};
    if (query.status) where.status = query.status as Prisma.EnumCompanySeoPageStatusFilter;
    if (query.indexable === 'true') where.indexable = true;
    if (query.indexable === 'false') where.indexable = false;
    if (query.q?.trim()) {
      where.OR = [
        { title: { contains: query.q.trim(), mode: 'insensitive' } },
        { company: { name: { contains: query.q.trim(), mode: 'insensitive' } } },
        { company: { ico: { contains: query.q.trim().replace(/\D/g, '') } } },
      ];
    }
    const companyWhere: Prisma.CompanyDirectoryEntryWhereInput = {};
    if (query.category) companyWhere.categories = { has: query.category as CompanyDirectoryEntry['categories'][number] };
    if (query.region) companyWhere.region = { equals: query.region, mode: 'insensitive' };
    if (query.city) companyWhere.city = { equals: query.city, mode: 'insensitive' };
    if (Object.keys(companyWhere).length) where.company = { is: companyWhere };

    const [total, rows] = await Promise.all([
      this.prisma.companySeoPage.count({ where }),
      this.prisma.companySeoPage.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              ico: true,
              slug: true,
              city: true,
              region: true,
              categories: true,
              website: true,
              email: true,
              profileStatus: true,
              seoStatus: true,
              indexStatus: true,
              shortDescription: true,
              contentEnrichedAt: true,
              publicProfile: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((r) => this.serializeAdminRow(r)),
      total,
      page,
      pageSize,
    };
  }

  async getByCompanyId(companyId: string) {
    const row = await this.prisma.companySeoPage.findUnique({
      where: { companyId },
      include: { company: true },
    });
    if (!row) return null;
    return this.serializeDetail(row);
  }

  async getPreview(seoPageId: string) {
    const row = await this.prisma.companySeoPage.findUnique({
      where: { id: seoPageId },
      include: {
        company: {
          include: {
            reviews: {
              where: { status: 'PUBLISHED' },
              orderBy: { publishedAt: 'desc' },
              take: 3,
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('SEO stránka firmy nenalezena.');
    const seoMeta = this.seo.buildPublicSeoMeta(row.company);
    return {
      seoPage: this.serializeDetail(row),
      company: row.company,
      seo: seoMeta,
      publicUrl: this.seo.buildCanonicalUrl(row.slug),
      preview: {
        title: row.title,
        metaDescription: row.metaDescription,
        h1: row.company.name,
        shortDescription: row.shortDescription,
        longDescription: row.longDescription,
        content: row.content,
        seoScore: row.seoScore,
        jsonLd: seoMeta.jsonLd,
      },
    };
  }

  async generateForCompany(
    companyId: string,
    options?: { forceUpdate?: boolean; skipEnrichmentWait?: boolean },
  ): Promise<CompanySeoGenerationResult> {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      include: {
        seoPage: true,
        reviews: { where: { status: 'PUBLISHED' }, take: 5, orderBy: { publishedAt: 'desc' } },
        posts: { where: { publishedAt: { not: null } }, take: 5, orderBy: { publishedAt: 'desc' } },
      },
    });
    if (!company) return { action: 'error', companyId, error: 'COMPANY_NOT_FOUND' };
    if (!this.isEligible(company)) {
      return { action: 'skipped', companyId, reason: 'INELIGIBLE' };
    }

    const existing = company.seoPage;
    if (existing && !options?.forceUpdate) {
      return {
        action: 'skipped',
        companyId,
        reason: 'SEO_PAGE_EXISTS',
      };
    }

    const needsEnrichment =
      company.website &&
      !company.contentEnrichedAt &&
      !company.shortDescription &&
      !company.description;

    if (needsEnrichment && !options?.skipEnrichmentWait) {
      await this.enrichment.enqueueForCompany(company.id, company.website ?? undefined);
      if (existing) {
        await this.prisma.companySeoPage.update({
          where: { id: existing.id },
          data: { status: 'WAITING_FOR_ENRICHMENT' },
        });
      }
      return { action: 'waiting_enrichment', companyId };
    }

    if (existing) {
      await this.prisma.companySeoPage.update({
        where: { id: existing.id },
        data: { status: 'GENERATING' },
      });
    }

    try {
      const generated = await this.buildSeoContent(company);
      const dup = await this.findDuplicateContent(company.id, generated.longDescription ?? generated.shortDescription ?? '');
      const services = extractServicesFromEnrichment(
        (company.enrichmentData ?? null) as CompanyEnrichmentPayload | null,
      );
      const score = computeSeoQualityScore({
        ...company,
        serviceCount: services.length,
        hasUniqueTitle: Boolean(generated.title),
        hasUniqueDescription: Boolean(generated.metaDescription),
      });
      const hasUniqueContent = Boolean(generated.shortDescription ?? generated.longDescription);
      const indexable =
        !dup &&
        shouldIndexCompany(score, hasUniqueContent, dup ? 'DUPLICATE_CONTENT_REVIEW' : 'READY') &&
        generated.shortDescription != null;
      const status: CompanySeoPageStatus = dup ? 'DUPLICATE_CONTENT_REVIEW' : indexable ? 'READY' : 'DRAFT';
      const contentHash = this.hashContent(generated);

      const data = {
        slug: company.slug,
        title: generated.title,
        metaDescription: generated.metaDescription,
        shortDescription: generated.shortDescription,
        longDescription: generated.longDescription,
        content: generated.content as object,
        seoScore: score,
        status,
        indexable,
        contentHash,
        similarityScore: dup?.similarity ?? null,
        qualityNotes: dup ? `Podobnost ${Math.round((dup.similarity ?? 0) * 100)} % s jinou firmou` : null,
        errorMessage: null,
        generatedAt: new Date(),
        version: existing ? existing.version + 1 : 1,
      };

      let seoPage;
      if (existing) {
        seoPage = await this.prisma.companySeoPage.update({
          where: { id: existing.id },
          data,
        });
      } else {
        seoPage = await this.prisma.companySeoPage.create({
          data: { companyId: company.id, ...data },
        });
      }

      await this.prisma.companyDirectoryEntry.update({
        where: { id: company.id },
        data: {
          seoTitle: generated.title,
          seoDescription: generated.metaDescription,
          shortDescription: generated.shortDescription ?? company.shortDescription,
          description: generated.longDescription ?? company.description,
          seoLastSignificantChangeAt: new Date(),
        },
      });

      await this.seo.evaluateCompany(company.id);
      await this.audit.log({
        companyId: company.id,
        action: existing ? 'COMPANY_SEO_PAGE_UPDATED' : 'COMPANY_SEO_PAGE_GENERATED',
        message: `SEO stránka ${existing ? 'aktualizována' : 'vytvořena'} (score ${score})`,
        meta: { seoPageId: seoPage.id, status, indexable },
      });

      return {
        action: existing ? 'updated' : 'created',
        seoPageId: seoPage.id,
        companyId: company.id,
        slug: company.slug,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`SEO generation failed for ${companyId}: ${message}`);
      if (existing) {
        await this.prisma.companySeoPage.update({
          where: { id: existing.id },
          data: { status: 'ERROR', errorMessage: message },
        });
      }
      return { action: 'error', companyId, error: message };
    }
  }

  async markOutdatedForCompany(companyId: string) {
    await this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: { seoDirty: true },
    });
    const page = await this.prisma.companySeoPage.findUnique({ where: { companyId } });
    if (!page || page.status === 'SEO_OUTDATED') return null;
    return this.prisma.companySeoPage.update({
      where: { id: page.id },
      data: { status: 'SEO_OUTDATED' },
    });
  }

  async getStats() {
    const [total, ready, indexable, outdated, duplicate, waiting, avgScore, companiesTotal, withPage] =
      await Promise.all([
        this.prisma.companySeoPage.count(),
        this.prisma.companySeoPage.count({ where: { status: 'READY' } }),
        this.prisma.companySeoPage.count({ where: { indexable: true } }),
        this.prisma.companySeoPage.count({ where: { status: 'SEO_OUTDATED' } }),
        this.prisma.companySeoPage.count({ where: { status: 'DUPLICATE_CONTENT_REVIEW' } }),
        this.prisma.companySeoPage.count({ where: { status: 'WAITING_FOR_ENRICHMENT' } }),
        this.prisma.companySeoPage.aggregate({ _avg: { seoScore: true } }),
        this.prisma.companyDirectoryEntry.count({
          where: { publicProfile: true, hidden: false, inLiquidation: false, inactive: false, dissolved: false },
        }),
        this.prisma.companySeoPage.count(),
      ]);
    return {
      totalPages: total,
      ready,
      indexable,
      outdated,
      duplicateReview: duplicate,
      waitingEnrichment: waiting,
      averageScore: Math.round(avgScore._avg.seoScore ?? 0),
      eligibleCompanies: companiesTotal,
      withoutPage: Math.max(0, companiesTotal - withPage),
    };
  }

  private async buildSeoContent(company: CompanyDirectoryEntry & {
    reviews?: Array<{ rating: number; title?: string | null; body: string }>;
    posts?: Array<{ id: string; content?: string | null }>;
  }) {
    const enrichment = (company.enrichmentData ?? null) as CompanyEnrichmentPayload | null;
    const services = extractServicesFromEnrichment(enrichment);
    const specializations = enrichment?.specializations?.map((s) => s.value).filter(Boolean) ?? [];
    const category = company.categories[0];
    const categoryLabel = category ? CATEGORY_LABELS[category] : 'firma';

    const title = buildCompanySeoTitle(company);
    const metaDescription = buildCompanyMetaDescription({ ...company, services });

    const aiCopy = await this.generateAiCopy(company, services, specializations, categoryLabel);
    const shortDescription = aiCopy.shortDescription ?? company.shortDescription;
    const longDescription = aiCopy.longDescription ?? company.description;

    const content: CompanySeoPageContent = {
      sections: [
        shortDescription
          ? { key: 'intro', title: 'Úvod', body: shortDescription }
          : null,
        longDescription
          ? { key: 'about', title: 'O firmě', body: longDescription }
          : null,
        services.length
          ? { key: 'services', title: 'Služby', items: services }
          : null,
        specializations.length
          ? { key: 'specializations', title: 'Specializace', items: specializations }
          : null,
        company.region || company.city
          ? {
              key: 'area',
              title: 'Působnost',
              body: [company.city, company.region].filter(Boolean).join(', '),
            }
          : null,
      ].filter(Boolean) as CompanySeoPageContent['sections'],
    };

    return { title, metaDescription, shortDescription, longDescription, content };
  }

  private async generateAiCopy(
    company: CompanyDirectoryEntry,
    services: string[],
    specializations: string[],
    categoryLabel: string,
  ): Promise<{ shortDescription?: string; longDescription?: string }> {
    if (company.shortDescription && company.description) {
      return {
        shortDescription: company.shortDescription,
        longDescription: company.description,
      };
    }

    const facts = [
      `Název: ${company.name}`,
      `IČO: ${company.ico}`,
      company.legalForm ? `Právní forma: ${company.legalForm}` : null,
      company.city ? `Město: ${company.city}` : null,
      company.region ? `Kraj: ${company.region}` : null,
      `Obor: ${categoryLabel}`,
      company.registeredAddress ? `Sídlo: ${company.registeredAddress}` : null,
      services.length ? `Služby: ${services.join(', ')}` : null,
      specializations.length ? `Specializace: ${specializations.join(', ')}` : null,
      company.website ? `Web: ${company.website}` : null,
      company.xxrealitReviewCount ? `Recenze XXREALIT: ${company.xxrealitReviewCount}` : null,
      ...(company.businessActivities?.slice(0, 5).map((a) => `Činnost: ${a}`) ?? []),
    ]
      .filter(Boolean)
      .join('\n');

    const status = await this.openai.getStatus();
    if (!status.enabled || !status.configured) {
      return this.ruleBasedCopy(company, services, categoryLabel);
    }

    try {
      const result = await this.openai.complete({
        feature: 'seo_ai_generate',
        systemPrompt: `Jsi SEO editor firemních profilů pro portál XXREALIT. Piš česky, věcně, originálně pro konkrétní firmu.
Používej pouze fakta ze vstupu. Nevymýšlej historii, ocenění ani čísla zákazníků.
Nekopíruj text webu — shrň ověřené informace vlastními slovy.
Vrať JSON: { "shortDescription": "160-300 znaků", "longDescription": "kratší pokud málo dat, max 1200 znaků" }`,
        userPrompt: `Fakta:\n${facts}`,
        jsonMode: true,
        maxOutputTokens: 2000,
      });
      const parsed = JSON.parse(result.text) as {
        shortDescription?: string;
        longDescription?: string;
      };
      return {
        shortDescription: parsed.shortDescription?.trim() || company.shortDescription || undefined,
        longDescription: parsed.longDescription?.trim() || company.description || undefined,
      };
    } catch (err) {
      this.log.warn(`AI SEO copy failed for ${company.id}: ${err instanceof Error ? err.message : err}`);
      return this.ruleBasedCopy(company, services, categoryLabel);
    }
  }

  private ruleBasedCopy(
    company: CompanyDirectoryEntry,
    services: string[],
    categoryLabel: string,
  ): { shortDescription?: string; longDescription?: string } {
    const city = company.city?.trim();
    const servicePart = services.slice(0, 3).join(', ');
    const short =
      city && servicePart
        ? `${company.name} působí v ${city} jako ${categoryLabel.toLowerCase()} se zaměřením na ${servicePart}.`
        : city
          ? `${company.name} je ${categoryLabel.toLowerCase()} v ${city} s profilem na XXREALIT.`
          : `${company.name} je zapsaná v registru firem XXREALIT.`;
    const long = [
      short,
      company.registeredAddress ? `Sídlo: ${company.registeredAddress}.` : null,
      services.length ? `Nabízené služby zahrnují ${services.join(', ')}.` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return {
      shortDescription: short.slice(0, 300),
      longDescription: long.slice(0, 1200),
    };
  }

  private hashContent(data: { title: string; shortDescription?: string | null; longDescription?: string | null }) {
    const raw = [data.title, data.shortDescription, data.longDescription].filter(Boolean).join('|');
    return createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  private async findDuplicateContent(companyId: string, text: string) {
    if (!text.trim()) return null;
    const peers = await this.prisma.companySeoPage.findMany({
      where: { companyId: { not: companyId }, longDescription: { not: null } },
      select: { id: true, longDescription: true, shortDescription: true },
      take: 40,
      orderBy: { updatedAt: 'desc' },
    });
    for (const p of peers) {
      const peerText = p.longDescription ?? p.shortDescription ?? '';
      const similarity = textSimilarity(text, peerText);
      if (similarity >= DUPLICATE_THRESHOLD) {
        return { id: p.id, similarity };
      }
    }
    return null;
  }

  private serializeAdminRow(
    row: Prisma.CompanySeoPageGetPayload<{
      include: { company: { select: {
        id: true; name: true; ico: true; slug: true; city: true; region: true;
        categories: true; website: true; email: true; profileStatus: true;
        seoStatus: true; indexStatus: true; shortDescription: true;
        contentEnrichedAt: true; publicProfile: true;
      } } };
    }>,
  ) {
    const c = row.company;
    const category = c.categories[0];
    return {
      id: row.id,
      companyId: c.id,
      name: c.name,
      ico: c.ico,
      slug: row.slug,
      city: c.city,
      region: c.region,
      category,
      categoryLabel: category ? CATEGORY_LABELS[category] : null,
      website: c.website,
      hasAiContent: Boolean(row.shortDescription || row.longDescription || c.contentEnrichedAt),
      seoScore: row.seoScore,
      status: row.status,
      indexable: row.indexable,
      googleStatus: c.indexStatus,
      seoStatus: c.seoStatus,
      publicProfile: c.publicProfile,
      profileStatus: c.profileStatus,
      updatedAt: row.updatedAt.toISOString(),
      publicUrl: `/firmy/${row.slug}`,
      previewUrl: `/admin/seo/firmy/${row.id}/preview`,
    };
  }

  private serializeDetail(
    row: Prisma.CompanySeoPageGetPayload<{ include?: { company?: true } }>,
  ) {
    return {
      id: row.id,
      companyId: row.companyId,
      slug: row.slug,
      title: row.title,
      metaDescription: row.metaDescription,
      shortDescription: row.shortDescription,
      longDescription: row.longDescription,
      content: row.content,
      seoScore: row.seoScore,
      status: row.status,
      indexable: row.indexable,
      contentHash: row.contentHash,
      similarityScore: row.similarityScore,
      qualityNotes: row.qualityNotes,
      errorMessage: row.errorMessage,
      version: row.version,
      generatedAt: row.generatedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      publicUrl: `/firmy/${row.slug}`,
    };
  }

  isEnrichmentStale(contentEnrichedAt: Date | null | undefined): boolean {
    if (!contentEnrichedAt) return true;
    const staleAt = new Date(contentEnrichedAt);
    staleAt.setDate(staleAt.getDate() + ENRICHMENT_STALE_DAYS);
    return staleAt < new Date();
  }
}
