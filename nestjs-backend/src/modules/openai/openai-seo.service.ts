import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiGenerationStatus, Prisma, SeoContentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { getProgrammaticSeoIntent } from '../seo/programmatic-seo-intents';
import { OpenAiService } from './openai.service';
import {
  parseSeoAiJson,
  validateSeoAiOutput,
  type SeoAiOutput,
} from './seo-ai-output.validator';

const SEO_AI_PROMPT_VERSION = 'seo-v1';

@Injectable()
export class OpenAiSeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
  ) {}

  async improveSeoContent(contentId: string, userId?: string) {
    const row = await this.prisma.seoPageContent.findUnique({
      where: { id: contentId },
      include: {
        location: {
          select: {
            name: true,
            slug: true,
            locative: true,
            population: true,
            kind: true,
            region: { select: { name: true } },
            district: { select: { name: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('SEO stránka nenalezena.');

    const intent = row.intentSlug ? getProgrammaticSeoIntent(row.intentSlug) : null;
    const locationName = row.location?.name ?? 'neznámá lokalita';
    const offerLabel = intent?.label ?? row.intentSlug ?? 'reality';
    const propertyLabel = intent?.propertyTypeKey ?? 'nemovitost';

    const contextFacts: string[] = [
      `Lokalita: ${locationName}`,
      intent?.offerType ? `Typ nabídky: ${intent.offerType}` : '',
      `Typ nemovitosti: ${propertyLabel}`,
      row.location?.region?.name ? `Kraj: ${row.location.region.name}` : '',
      row.location?.district?.name ? `Okres: ${row.location.district.name}` : '',
      row.location?.population ? `Počet obyvatel: ${row.location.population}` : '',
    ].filter(Boolean);

    const currentText = {
      title: row.title ?? '',
      description: row.description ?? '',
      h1: row.h1 ?? '',
      bodyText: row.bodyText ?? '',
      faq: Array.isArray(row.faq) ? row.faq : [],
    };

    const systemPrompt = `Jsi copywriter pro český realitní portál XXREALIT.
Piš výhradně v češtině. Vracej pouze validní JSON bez markdownu.
Nepřidávej vymyšlené statistiky, ceny, počty inzerátů, hodnocení ani garance.
Nepřidávej HTML, skripty ani externí odkazy.
Používej pouze fakta z uživatelského kontextu.
Struktura JSON: metaTitle, metaDescription, h1, introText, mainContent, faq (pole {question, answer}).
metaTitle max 60 znaků, metaDescription 130–160 znaků, jeden H1.`;

    const userPrompt = `Vylepši SEO text pro stránku "${offerLabel} ${locationName}".

Fakta (použij pouze tato):
${contextFacts.map((f) => `- ${f}`).join('\n')}

Současný šablonový obsah:
${JSON.stringify(currentText, null, 2)}

Vrať JSON s poli metaTitle, metaDescription, h1, introText, mainContent, faq.`;

    const generation = await this.prisma.aiGeneration.create({
      data: {
        feature: 'seo_improve',
        entityType: 'SeoPageContent',
        entityId: contentId,
        promptVersion: SEO_AI_PROMPT_VERSION,
        status: AiGenerationStatus.PENDING,
      },
    });

    try {
      const result = await this.openai.complete({
        feature: 'seo_improve',
        systemPrompt,
        userPrompt,
        userId,
        jsonMode: true,
      });

      let parsed: unknown;
      try {
        parsed = parseSeoAiJson(result.text);
      } catch {
        throw new BadRequestException('AI vrátila neplatný JSON.');
      }

      const validation = validateSeoAiOutput(parsed);
      if (!validation.ok) {
        await this.prisma.aiGeneration.update({
          where: { id: generation.id },
          data: {
            status: AiGenerationStatus.FAILED,
            model: result.model,
            generatedContent: { errors: validation.errors, raw: result.text } as Prisma.InputJsonValue,
          },
        });
        throw new BadRequestException(`Neplatný AI výstup: ${validation.errors.join(' ')}`);
      }

      const proposal = validation.data;
      const updated = await this.prisma.aiGeneration.update({
        where: { id: generation.id },
        data: {
          status: AiGenerationStatus.COMPLETED,
          model: result.model,
          generatedContent: proposal as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        generationId: updated.id,
        status: updated.status,
        model: result.model,
        durationMs: result.durationMs,
        context: {
          locationName,
          offerLabel,
          propertyLabel,
          intentSlug: row.intentSlug,
          locationSlug: row.location?.slug,
        },
        current: currentText,
        proposal,
      };
    } catch (err) {
      if (!(err instanceof BadRequestException)) {
        await this.prisma.aiGeneration.update({
          where: { id: generation.id },
          data: {
            status: AiGenerationStatus.FAILED,
            generatedContent: {
              error: err instanceof Error ? err.message : String(err),
            } as Prisma.InputJsonValue,
          },
        });
      }
      throw err;
    }
  }

  async applyGeneration(generationId: string, userId?: string) {
    const gen = await this.prisma.aiGeneration.findUnique({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('AI návrh nenalezen.');
    if (gen.status !== AiGenerationStatus.COMPLETED) {
      throw new BadRequestException('Návrh není připraven k použití.');
    }

    const proposal = gen.generatedContent as SeoAiOutput | null;
    const validation = validateSeoAiOutput(proposal);
    if (!validation.ok) {
      throw new BadRequestException(`Neplatný návrh: ${validation.errors.join(' ')}`);
    }

    const content = await this.prisma.seoPageContent.findUnique({ where: { id: gen.entityId } });
    if (!content) throw new NotFoundException('SEO stránka nenalezena.');
    if (content.isLocked) throw new BadRequestException('Obsah je zamčený.');

    const data = validation.data;
    const bodyText = `${data.introText}\n\n${data.mainContent}`;

    const version =
      (await this.prisma.seoPageContentVersion.count({ where: { contentId: content.id } })) + 1;
    await this.prisma.seoPageContentVersion.create({
      data: {
        contentId: content.id,
        version,
        snapshot: content as unknown as Prisma.InputJsonValue,
        createdBy: userId,
        note: 'Před použitím AI návrhu',
      },
    });

    const updated = await this.prisma.seoPageContent.update({
      where: { id: content.id },
      data: {
        title: data.metaTitle,
        description: data.metaDescription,
        h1: data.h1,
        bodyText,
        faq: data.faq as Prisma.InputJsonValue,
        ogTitle: data.metaTitle,
        ogDescription: data.metaDescription,
        aiGenerated: true,
        status: SeoContentStatus.DRAFT,
        lastGeneratedAt: new Date(),
      },
      include: { location: { select: { name: true, slug: true } } },
    });

    await this.prisma.aiGeneration.update({
      where: { id: generationId },
      data: {
        status: AiGenerationStatus.APPROVED,
        approvedContent: data as unknown as Prisma.InputJsonValue,
        approvedById: userId ?? null,
        approvedAt: new Date(),
      },
    });

    return { page: updated, generationId };
  }

  async rejectGeneration(generationId: string) {
    const gen = await this.prisma.aiGeneration.findUnique({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('AI návrh nenalezen.');
    await this.prisma.aiGeneration.update({
      where: { id: generationId },
      data: { status: AiGenerationStatus.REJECTED },
    });
    return { success: true };
  }

  async getGeneration(generationId: string) {
    const gen = await this.prisma.aiGeneration.findUnique({ where: { id: generationId } });
    if (!gen) throw new NotFoundException('AI návrh nenalezen.');
    return gen;
  }
}
