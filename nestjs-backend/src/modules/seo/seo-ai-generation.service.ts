import { BadRequestException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AiKnowledgeStatus,
  AiPromptStatus,
  Prisma,
  SeoAiLayoutType,
  SeoContentStatus,
  SeoGenerationMode,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import type { CzGeoLocation } from './cz-geo-locations.data';
import { getProgrammaticSeoIntent } from './programmatic-seo-intents';
import { buildProgrammaticSeoPath, buildExtendedSeoMetadata } from './programmatic-seo.util';
import { seoLocationToCopyInput } from './seo-generation.util';
import { buildProgrammaticSeoPageKey } from './seo-location.util';
import { LocalityResolverService } from './locality-resolver.service';
import { SeoLocationService } from './seo-location.service';
import type { SeoAiGenerateInput, SeoAiPageOutput } from './seo-ai-layout.types';
import { SEO_KNOWLEDGE_CATEGORIES } from './seo-ai-layout.types';
import { parseSeoAiPageJson, validateSeoAiPageOutput } from './seo-ai-page.validator';
import { SeoAiQualityService } from './seo-ai-quality.service';
import { DEFAULT_SEO_AI_SYSTEM_PROMPT } from './seo-ai-prompt.defaults';
import {
  normalizeSeoAiAudience,
  normalizeSeoAiContentLength,
  normalizeSeoAiOfferType,
  normalizeSeoAiPropertyType,
  normalizeSeoAiTone,
  resolveIntentSlugFromEnums,
} from './seo-ai.enums';
import { mapOpenAiError, SeoAiHttpException } from './seo-ai.errors';

function resolveIntentSlug(input: SeoAiGenerateInput): string {
  const offer = normalizeSeoAiOfferType(input.offerType);
  const property = normalizeSeoAiPropertyType(input.propertyType);
  return resolveIntentSlugFromEnums(offer, property, input.intentSlug);
}

@Injectable()
export class SeoAiGenerationService {
  private readonly log = new Logger(SeoAiGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly localityResolver: LocalityResolverService,
    private readonly locations: SeoLocationService,
    private readonly quality: SeoAiQualityService,
  ) {}

  async generateTestPage(input: SeoAiGenerateInput, userId?: string) {
    return this.generateAndSave(input, userId, { isTest: true });
  }

  async generateAndSave(
    input: SeoAiGenerateInput,
    userId?: string,
    opts?: { isTest?: boolean; existingPageId?: string },
  ) {
    const startedAt = Date.now();
    const intentSlug = resolveIntentSlug(input);
    const intent = getProgrammaticSeoIntent(intentSlug as never);
    if (!intent) throw new BadRequestException('Neznámý typ nabídky / nemovitosti.');

    const resolved = await this.localityResolver.resolve({
      localityId: input.localityId,
      localitySlug: input.localitySlug ?? input.locationSlug,
      region: input.region,
      district: input.district,
      createIfMissing: opts?.isTest || input.createLocationIfMissing,
    });

    const dbLoc = await this.prisma.seoLocation.findUniqueOrThrow({
      where: { id: resolved.id },
      include: {
        region: { select: { name: true } },
        district: { select: { name: true } },
      },
    });

    const listingCount = input.useListings !== false
      ? await this.countListings(dbLoc.id, intent.offerType, intent.propertyTypeKey)
      : 0;
    const hasListings = listingCount > 0;

    const context = await this.buildGenerationContext(input, intentSlug, dbLoc, listingCount);
    const prompt = await this.getActivePrompt('SEO_PAGE_GENERATION');

    const userPrompt = this.buildUserPrompt(input, context, intent.label, dbLoc.name, hasListings);

    let aiResult;
    try {
      aiResult = await this.openai.complete({
        feature: 'seo_ai_generate',
        systemPrompt: prompt.systemPrompt,
        userPrompt,
        userId,
        jsonMode: true,
      });
    } catch (err) {
      this.log.warn(`OpenAI SEO generate failed: ${err instanceof Error ? err.message : err}`);
      if (err instanceof SeoAiHttpException) throw err;
      throw mapOpenAiError(err);
    }

    let parsed: unknown;
    try {
      parsed = parseSeoAiPageJson(aiResult.text);
    } catch {
      throw new BadRequestException('AI vrátila neplatný JSON.');
    }

    const validation = validateSeoAiPageOutput(parsed, { hasListings });
    if (!validation.ok) {
      throw new BadRequestException(`Neplatný AI výstup: ${validation.errors.join(' ')}`);
    }

    const output = validation.data;
    const similarPages = await this.prisma.seoPageContent.findMany({
      where: { id: opts?.existingPageId ? { not: opts.existingPageId } : undefined },
      select: { id: true, title: true, description: true, h1: true, bodyText: true },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    });

    const scores = this.quality.scorePage(output, {
      hasListings,
      listingCount,
      similarPages,
      indexImmediately: input.indexImmediately,
    });

    const pageKey = buildProgrammaticSeoPageKey(intentSlug, dbLoc.slug);
    const publicPath = buildProgrammaticSeoPath(intentSlug, dbLoc.slug);

    const existingPage = await this.prisma.seoPageContent.findUnique({
      where: { pageKey },
      select: { id: true, status: true, generationMode: true },
    });
    if (existingPage && !opts?.existingPageId && !opts?.isTest) {
      throw new SeoAiHttpException(
        'SEO_PAGE_ALREADY_EXISTS',
        'Pro tuto lokalitu a typ nabídky už existuje SEO stránka.',
        HttpStatus.CONFLICT,
        {
          existingPageId: existingPage.id,
          actions: ['CREATE_REVISION', 'AI_IMPROVE_EXISTING', 'CANCEL'],
        },
      );
    }
    const existingPageId = opts?.existingPageId ?? (existingPage && opts?.isTest ? existingPage.id : undefined);
    const locForCopy = seoLocationToCopyInput(dbLoc) as CzGeoLocation;
    const extended = buildExtendedSeoMetadata(intent, locForCopy, {
      path: publicPath,
      title: output.metaTitle,
      description: output.metaDescription,
      h1: output.h1,
      h2: output.subtitle || '',
      bodyText: this.composeBodyText(output),
      heroSubtitle: output.subtitle || '',
      heroImageUrl: '',
      heroImageAlt: `${output.h1} – ${dbLoc.name}`,
      sections: output.blocks.map((b) => ({
        id: b.type,
        h2: b.title ?? b.type,
        paragraphs: [b.content],
      })),
      keywords: [
        input.primaryKeyword,
        ...(input.secondaryKeywords ?? []),
        intent.label,
        dbLoc.name,
      ].filter(Boolean) as string[],
      faq: output.faq,
      wordCount: this.composeBodyText(output).split(/\s+/).length,
    });

    let status: SeoContentStatus = SeoContentStatus.DRAFT;
    const initialStatus = input.initialStatus ?? input.status ?? 'DRAFT';
    if (initialStatus === 'PUBLISHED' && scores.recommendedStatus === 'PUBLISHED') {
      status = SeoContentStatus.PUBLISHED;
    } else if (initialStatus === 'REVIEW' || scores.recommendedStatus === 'REVIEW') {
      status = SeoContentStatus.AI_REVIEW;
    } else if (scores.recommendedStatus === 'NEEDS_IMPROVEMENT') {
      status = SeoContentStatus.NEEDS_IMPROVEMENT;
    } else if (input.publish && scores.qualityScore >= 75 && scores.uniquenessScore >= 75) {
      status = SeoContentStatus.PUBLISHED;
    }

    const noindex = !scores.indexable && status !== SeoContentStatus.PUBLISHED;

    const data: Prisma.SeoPageContentCreateInput = {
      pageKey,
      intentSlug,
      location: { connect: { id: dbLoc.id } },
      status,
      title: output.metaTitle,
      description: output.metaDescription,
      h1: output.h1,
      h2: output.subtitle || null,
      editorialTitle: output.editorialTitle,
      subtitle: output.subtitle || null,
      bodyText: this.composeBodyText(output),
      faq: output.faq as Prisma.InputJsonValue,
      internalLinks: output.internalLinks as Prisma.InputJsonValue,
      keywords: [
        input.primaryKeyword,
        ...(input.secondaryKeywords ?? []),
        intent.label,
        dbLoc.name,
      ].filter(Boolean) as string[],
      canonical: extended.canonical,
      robots: noindex ? 'noindex,follow' : extended.robots,
      noindex,
      indexable: scores.indexable && status === SeoContentStatus.PUBLISHED,
      ogTitle: output.metaTitle,
      ogDescription: output.metaDescription,
      ogImage: extended.ogImage,
      twitterCard: extended.twitterCard,
      schemaJson: extended.schemaJson as Prisma.InputJsonValue,
      aiGenerated: true,
      generationMode: SeoGenerationMode.AI,
      aiModel: aiResult.model,
      aiPromptVersionId: prompt.id,
      aiGeneratedAt: new Date(),
      qualityScore: scores.qualityScore,
      aiQualityScore: scores.qualityScore,
      uniquenessScore: scores.uniquenessScore,
      duplicateRisk: scores.duplicateRisk,
      similarPageIdsJson: scores.similarPageIds as Prisma.InputJsonValue,
      factCheckStatus: output.sourceClaims.some((c) => c.verified) ? 'VERIFIED_PARTIAL' : 'NEEDS_REVIEW',
      layoutType: output.layout as SeoAiLayoutType,
      contentBlocksJson: output.blocks as Prisma.InputJsonValue,
      sourceClaimsJson: output.sourceClaims as Prisma.InputJsonValue,
      lastGeneratedAt: new Date(),
      publishedAt: status === SeoContentStatus.PUBLISHED ? new Date() : null,
    };

    const page = existingPageId
      ? await this.prisma.seoPageContent.update({
          where: { id: existingPageId },
          data: { ...data, location: { connect: { id: dbLoc.id } } },
          include: { location: { select: { name: true, slug: true } } },
        })
      : await this.prisma.seoPageContent.upsert({
          where: { pageKey },
          create: data,
          update: { ...data, location: { connect: { id: dbLoc.id } } },
          include: { location: { select: { name: true, slug: true } } },
        });

    const durationMs = Date.now() - startedAt;

    return {
      success: true,
      action: existingPageId ? 'updated' : 'created',
      pageId: page.id,
      slug: publicPath.replace(/^\//, ''),
      publicPath,
      previewUrl: `/admin/seo/pages/${page.id}/preview`,
      publicUrl: status === SeoContentStatus.PUBLISHED ? publicPath : null,
      title: page.title,
      h1: page.h1,
      editorialTitle: page.editorialTitle,
      metaTitle: page.title,
      qualityScore: scores.qualityScore,
      uniquenessScore: scores.uniquenessScore,
      duplicateRisk: scores.duplicateRisk,
      factCheckStatus: page.factCheckStatus,
      layoutType: page.layoutType,
      sourceClaims: output.sourceClaims,
      promptVersionId: prompt.id,
      promptVersion: prompt.version,
      model: aiResult.model,
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
      estimatedCostCzk: aiResult.estimatedCostCzk ?? 0,
      status: page.status,
      indexable: page.indexable,
      hasListings,
      listingCount,
      qualityReasons: scores.reasons,
      analysisStatus: 'COMPLETED',
      localityId: dbLoc.id,
      localitySlug: dbLoc.slug,
      generation: {
        model: aiResult.model,
        durationMs,
        inputTokens: aiResult.inputTokens,
        outputTokens: aiResult.outputTokens,
        costCzk: aiResult.estimatedCostCzk ?? 0,
      },
    };
  }

  async regeneratePage(pageId: string, userId?: string) {
    const page = await this.prisma.seoPageContent.findUnique({
      where: { id: pageId },
      include: { location: { select: { slug: true } } },
    });
    if (!page) throw new NotFoundException('Stránka nenalezena.');
    if (!page.location?.slug || !page.intentSlug) {
      throw new BadRequestException('Stránka nemá lokalitu nebo intent.');
    }
    return this.generateAndSave(
      {
        locationSlug: page.location.slug,
        intentSlug: page.intentSlug,
        initialStatus: 'REVIEW',
      },
      userId,
      { existingPageId: pageId },
    );
  }

  async getDiagnostics() {
    const [localityCount, promptCount, openAiStatus] = await Promise.all([
      this.prisma.seoLocation.count({ where: { isActive: true } }),
      this.prisma.aiPromptVersion.count({
        where: { feature: 'SEO_PAGE_GENERATION', status: AiPromptStatus.ACTIVE },
      }),
      this.openai.getStatus(),
    ]);
    return {
      backendAvailable: true,
      moduleRegistered: true,
      openAiEnabled: openAiStatus.enabled,
      apiKeyConfigured: openAiStatus.apiKeyConfigured,
      model: openAiStatus.model ?? process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      localityCount,
      activePromptConfigured: promptCount > 0,
      ruianAvailable: true,
      csuAvailable: true,
    };
  }

  async getAiPreview(pageId: string) {
    const page = await this.prisma.seoPageContent.findUnique({
      where: { id: pageId },
      include: {
        location: {
          select: {
            name: true,
            slug: true,
            locative: true,
            population: true,
            region: { select: { name: true } },
            district: { select: { name: true } },
          },
        },
      },
    });
    if (!page) throw new NotFoundException('Stránka nenalezena.');
    return {
      pageId: page.id,
      status: page.status,
      generationMode: page.generationMode,
      layoutType: page.layoutType,
      h1: page.h1,
      editorialTitle: page.editorialTitle,
      subtitle: page.subtitle,
      metaTitle: page.title,
      metaDescription: page.description,
      qualityScore: page.aiQualityScore,
      uniquenessScore: page.uniquenessScore,
      duplicateRisk: page.duplicateRisk,
      factCheckStatus: page.factCheckStatus,
      indexable: page.indexable,
      noindex: page.noindex,
      contentBlocks: page.contentBlocksJson,
      sourceClaims: page.sourceClaimsJson,
      similarPageIds: page.similarPageIdsJson,
      schemaJson: page.schemaJson,
      aiModel: page.aiModel,
      aiPromptVersionId: page.aiPromptVersionId,
      aiGeneratedAt: page.aiGeneratedAt,
      location: page.location,
      publicPath: page.intentSlug && page.location?.slug
        ? buildProgrammaticSeoPath(page.intentSlug, page.location.slug)
        : null,
    };
  }

  private composeBodyText(output: SeoAiPageOutput): string {
    const parts = [output.introText, output.mainContent];
    for (const block of output.blocks) {
      if (block.type === 'MAIN_CONTENT' || block.type === 'INTRO') continue;
      parts.push(block.title ? `## ${block.title}\n\n${block.content}` : block.content);
    }
    if (output.cta.text) parts.push(`${output.cta.title}\n${output.cta.text}`);
    return parts.filter(Boolean).join('\n\n');
  }

  private async buildGenerationContext(
    input: SeoAiGenerateInput,
    intentSlug: string,
    dbLoc: {
      name: string;
      slug: string;
      locative: string;
      population: number | null;
      officialCode: string;
      region?: { name: string } | null;
      district?: { name: string } | null;
    },
    listingCount: number,
  ) {
    const facts: string[] = [];
    const knowledge: string[] = [];

    facts.push(`Lokalita: ${dbLoc.name}`);
    if (dbLoc.locative) facts.push(`Lokál: ${dbLoc.locative}`);
    if (input.useRuian !== false && dbLoc.officialCode) {
      facts.push(`RÚIAN kód: ${dbLoc.officialCode} (ověřeno)`);
    }
    if (input.useCsu !== false && dbLoc.population) {
      facts.push(`Počet obyvatel: ${dbLoc.population} (zdroj ČSÚ, ověřeno)`);
    }
    if (dbLoc.region?.name) facts.push(`Kraj: ${dbLoc.region.name}`);
    if (dbLoc.district?.name) facts.push(`Okres: ${dbLoc.district.name}`);

    facts.push(
      listingCount > 0
        ? `Aktivní nabídky v databázi: ${listingCount} (ověřeno)`
        : 'Aktivní nabídky v databázi: 0 (ověřeno — nevymýšlej inzeráty)',
    );

    const approvedKnowledge = await this.prisma.aiKnowledgeItem.findMany({
      where: {
        status: AiKnowledgeStatus.APPROVED,
        category: { in: [...SEO_KNOWLEDGE_CATEGORIES] },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 20,
    });

    for (const item of approvedKnowledge) {
      knowledge.push(`[${item.category}] ${item.question}: ${item.answer}`);
    }

    const related = await this.locations.findRelated(dbLoc.slug, 6);

    return {
      intentSlug,
      facts,
      knowledge,
      relatedLocations: related,
      listingCount,
      tone: input.tone ?? 'Přirozený',
      targetAudience: input.targetAudience ?? 'kupující',
      primaryKeyword: input.primaryKeyword ?? '',
      secondaryKeywords: input.secondaryKeywords ?? [],
      length: input.length ?? 'medium',
    };
  }

  private buildUserPrompt(
    input: SeoAiGenerateInput,
    context: Awaited<ReturnType<SeoAiGenerationService['buildGenerationContext']>>,
    offerLabel: string,
    locationName: string,
    hasListings: boolean,
  ): string {
    return `Vytvoř originální SEO stránku pro kombinaci:
- Nabídka: ${offerLabel}
- Lokalita: ${locationName}
- Cílové klíčové slovo: ${context.primaryKeyword || offerLabel + ' ' + locationName}
- Sekundární klíčová slova: ${context.secondaryKeywords.join(', ') || '—'}
- Tón: ${context.tone}
- Cílová skupina: ${context.targetAudience}
- Délka: ${context.length}

Ověřená fakta (použij pouze tato, u každého uveď ve sourceClaims):
${context.facts.map((f) => `- ${f}`).join('\n')}

Schválené znalosti portálu:
${context.knowledge.length ? context.knowledge.map((k) => `- ${k}`).join('\n') : '- žádné'}

Související lokality (pro interní odkazy):
${context.relatedLocations.map((r) => `- ${r.name}: /${context.intentSlug}/${r.slug}`).join('\n')}

${hasListings ? 'V databázi jsou aktivní nabídky — můžeš zmínit, že nabídky existují, ale nevymýšlej konkrétní inzeráty.' : 'V databázi NEJSOU aktivní nabídky — použij blok NO_LISTINGS_GUIDE, nenaznačuj existenci nabídek.'}

Vrať JSON s poli:
layout (jeden z: LOCALITY_GUIDE, PROPERTY_OVERVIEW, FAMILY_LIVING, INVESTMENT_GUIDE, CITY_AND_SURROUNDINGS, COMPACT_SEARCH_PAGE, EDITORIAL_REAL_ESTATE_GUIDE),
slugSuggestion, editorialTitle, subtitle, metaTitle, metaDescription, h1, introText, mainContent,
blocks (pole {type, title?, content, items?}), faq, internalLinks ({label, path}),
cta ({title, text, buttonLabel, buttonPath}), sourceClaims ({claim, sourceType, sourceId?, verified}).`;
  }

  private async getActivePrompt(feature: string) {
    const active = await this.prisma.aiPromptVersion.findFirst({
      where: { feature, status: AiPromptStatus.ACTIVE },
      orderBy: { activatedAt: 'desc' },
    });
    if (active) {
      return { id: active.id, version: active.version, systemPrompt: active.systemPrompt };
    }
    return { id: null, version: 'seo-ai-v1-default', systemPrompt: DEFAULT_SEO_AI_SYSTEM_PROMPT };
  }

  private async countListings(
    locationId: string,
    offerType?: string,
    propertyTypeKey?: string,
  ): Promise<number> {
    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
      approved: true,
      isActive: true,
      isVisible: true,
      seoLocationId: locationId,
    };
    if (offerType) {
      const variants =
        offerType === 'pronajem'
          ? ['pronájem', 'pronajem', 'nájem', 'najem']
          : ['prodej', 'prodej'];
      where.OR = variants.map((v) => ({ offerType: { equals: v, mode: 'insensitive' } }));
    }
    if (propertyTypeKey) {
      where.AND = [
        {
          OR: [
            { propertyTypeKey: { equals: propertyTypeKey, mode: 'insensitive' } },
            { propertyType: { contains: propertyTypeKey.replace('_', ' '), mode: 'insensitive' } },
          ],
        },
      ];
    }
    return this.prisma.property.count({ where });
  }
}
