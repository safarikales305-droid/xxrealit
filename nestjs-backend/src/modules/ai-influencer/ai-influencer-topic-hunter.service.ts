import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AiInfluencerTopicCandidateStatus,
  AiInfluencerTopicOrigin,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import type { ReelScriptPayload } from './ai-influencer.types';
import { AiInfluencerSettingsService } from './ai-influencer-settings.service';
import {
  buildTopicFingerprint,
  buildTitleHash,
  computeTotalTopicScore,
  normalizeTopicUrl,
  sanitizeAbsoluteClaim,
  titleSimilarity,
  TOPIC_HUNTER_SEARCH_TEMPLATES,
} from './ai-influencer-topic.util';
import { AiInfluencerUrlExtractService } from './ai-influencer-url-extract.service';
import { AiInfluencerJobService } from './ai-influencer-job.service';
import { WebTopicDiscoveryProvider } from './providers/web-topic-discovery.provider';

type TopicAnalysisJson = {
  title?: string;
  summary?: string;
  category?: string;
  region?: string;
  viralScore?: number;
  relevanceScore?: number;
  freshnessScore?: number;
  confidenceScore?: number;
  videoPotentialScore?: number;
  scoreExplanation?: string;
  proposedHook?: string;
  proposedTitle?: string;
  safeHeadline?: string;
  facts?: Array<{ key: string; value: string; verified: boolean; sourceQuote?: string }>;
  sources?: Array<{ name: string; url: string; usedFacts?: string[] }>;
  script?: ReelScriptPayload;
  trendDetected?: boolean;
};

export type TopicCandidateListFilter =
  | 'all'
  | 'top'
  | 'today'
  | 'cz'
  | 'prague'
  | 'luxury'
  | 'cheap'
  | 'bizarre'
  | 'mortgages'
  | 'development'
  | 'trends'
  | 'url'
  | 'used'
  | 'ignored';

@Injectable()
export class AiInfluencerTopicHunterService {
  private readonly log = new Logger(AiInfluencerTopicHunterService.name);
  private discoveryRunning = false;
  private discoveryProgress: {
    phase: 'idle' | 'searching' | 'analyzing' | 'fact_checking' | 'scoring' | 'done' | 'error';
    message: string;
    found?: number;
    startedAt?: string;
    finishedAt?: string;
    error?: string;
  } = { phase: 'idle', message: 'Neaktivní' };

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiInfluencerSettingsService,
    private readonly urlExtract: AiInfluencerUrlExtractService,
    private readonly discovery: WebTopicDiscoveryProvider,
    private readonly openAi: OpenAiService,
    private readonly jobs: AiInfluencerJobService,
  ) {}

  getDiscoveryProgress() {
    return this.discoveryProgress;
  }

  private clampScore(v: unknown, fallback = 50): number {
    const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(100, Math.max(0, Math.trunc(n)));
  }

  private parseAnalysis(text: string): TopicAnalysisJson {
    const trimmed = text.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI nevrátilo validní JSON.');
    return JSON.parse(trimmed.slice(start, end + 1)) as TopicAnalysisJson;
  }

  private buildWhere(filter: TopicCandidateListFilter): Prisma.AiInfluencerTopicCandidateWhereInput {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    switch (filter) {
      case 'top':
        return { status: AiInfluencerTopicCandidateStatus.READY, totalScore: { gte: 80 } };
      case 'today':
        return { discoveredAt: { gte: dayStart }, status: { not: AiInfluencerTopicCandidateStatus.REJECTED } };
      case 'cz':
        return { country: 'CZ', status: { in: [AiInfluencerTopicCandidateStatus.READY, AiInfluencerTopicCandidateStatus.DISCOVERED] } };
      case 'prague':
        return { region: { contains: 'Praha', mode: 'insensitive' } };
      case 'luxury':
        return { category: { contains: 'luxus', mode: 'insensitive' } };
      case 'cheap':
        return { category: { contains: 'levn', mode: 'insensitive' } };
      case 'bizarre':
        return { category: { contains: 'biz', mode: 'insensitive' } };
      case 'mortgages':
        return { category: { contains: 'hypot', mode: 'insensitive' } };
      case 'development':
        return { category: { contains: 'develop', mode: 'insensitive' } };
      case 'trends':
        return { trendDetected: true };
      case 'url':
        return { origin: AiInfluencerTopicOrigin.URL_IMPORT };
      case 'used':
        return { status: { in: [AiInfluencerTopicCandidateStatus.VIDEO_QUEUED, AiInfluencerTopicCandidateStatus.VIDEO_CREATED] } };
      case 'ignored':
        return { status: AiInfluencerTopicCandidateStatus.REJECTED };
      default:
        return { status: { notIn: [AiInfluencerTopicCandidateStatus.REJECTED, AiInfluencerTopicCandidateStatus.DUPLICATE] } };
    }
  }

  async listCandidates(filter: TopicCandidateListFilter = 'all', limit = 40) {
    const cfg = await this.settings.getSettings();
    const rows = await this.prisma.aiInfluencerTopicCandidate.findMany({
      where: this.buildWhere(filter),
      orderBy: [{ totalScore: 'desc' }, { discoveredAt: 'desc' }],
      take: limit,
    });
    const todayCount = await this.prisma.aiInfluencerTopicCandidate.count({
      where: { discoveredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });
    return {
      items: rows,
      todayCount,
      minScore: cfg.topicHunter.minTotalScore,
      discovery: this.discoveryProgress,
      searchConfigured: this.discovery.isConfigured(),
    };
  }

  async getCandidate(id: string) {
    const row = await this.prisma.aiInfluencerTopicCandidate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Návrh tématu nenalezen.');
    return row;
  }

  private async findDuplicate(input: {
    canonicalUrl?: string | null;
    title?: string | null;
    fingerprint?: string | null;
  }) {
    if (input.fingerprint) {
      const byFp = await this.prisma.aiInfluencerTopicCandidate.findFirst({
        where: {
          topicFingerprint: input.fingerprint,
          status: { not: AiInfluencerTopicCandidateStatus.REJECTED },
        },
      });
      if (byFp) return byFp;
    }
    if (input.canonicalUrl) {
      const canonical = normalizeTopicUrl(input.canonicalUrl);
      const byUrl = await this.prisma.aiInfluencerTopicCandidate.findFirst({
        where: { canonicalUrl: canonical, status: { not: AiInfluencerTopicCandidateStatus.REJECTED } },
      });
      if (byUrl) return byUrl;
    }
    if (input.title) {
      const recent = await this.prisma.aiInfluencerTopicCandidate.findMany({
        where: {
          discoveredAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          status: { notIn: [AiInfluencerTopicCandidateStatus.REJECTED, AiInfluencerTopicCandidateStatus.DUPLICATE] },
        },
        take: 100,
        orderBy: { discoveredAt: 'desc' },
      });
      for (const row of recent) {
        if (titleSimilarity(row.title, input.title) >= 0.78) return row;
      }
    }
    return null;
  }

  private async analyzeContent(input: {
    title: string;
    summary: string;
    mainText: string;
    sourceUrl: string;
    sourceName: string;
    publishedAt?: string | null;
    origin: AiInfluencerTopicOrigin;
    extraSources?: Array<{ title: string; url: string; snippet: string }>;
  }) {
    const cfg = await this.settings.getSettings();
    const userPrompt = `Analyzuj obsah pro krátké vertikální realitní video XXREALIT (Reels).

PRAVIDLA:
- NIKDY netvrď absolutní rekord (nejdražší/nejlevnější v ČR), pokud to nelze spolehlivě doložit.
- Používej bezpečné formulace: "jedna z nejdražších dohledatelných nabídek".
- Každé číslo/cenu/lokalitu uváděj jen pokud je ve zdroji.
- Vytvoř hook pro první 1-3 sekundy (AI moderátorka, bez černé obrazovky).
- Značku XXREALIT zapracuj přirozeně max 1-2×.
- Nevymýšlej fakta.

ZDROJ: ${input.sourceName}
URL: ${input.sourceUrl}
Publikováno: ${input.publishedAt ?? 'neznámé'}
Titulek: ${input.title}
Perex: ${input.summary}
Text: ${input.mainText.slice(0, 6000)}
${input.extraSources?.length ? `Další zdroje:\n${input.extraSources.map((s, i) => `${i + 1}. ${s.title} — ${s.snippet}`).join('\n')}` : ''}

Vrať JSON:
{
  "title": "...",
  "summary": "...",
  "category": "...",
  "region": "...",
  "viralScore": 0-100,
  "relevanceScore": 0-100,
  "freshnessScore": 0-100,
  "confidenceScore": 0-100,
  "videoPotentialScore": 0-100,
  "scoreExplanation": "jedna věta proč",
  "proposedHook": "...",
  "proposedTitle": "...",
  "safeHeadline": "...",
  "trendDetected": false,
  "facts": [{"key":"cena","value":"...","verified":true,"sourceQuote":"..."}],
  "sources": [{"name":"...","url":"...","usedFacts":["cena"]}],
  "script": {
    "hook":"...","intro":"...","segments":[{"text":"...","headline":"..."}],"cta":"...",
    "spokenText":"...","captionTitle":"...","captionDescription":"...","hashtags":["#xxrealit"],
    "estimatedDuration": 35,
    "scenes": [{"start":0,"duration":3,"type":"AVATAR_FULL","text":"..."}]
  }
}`;

    const result = await this.openAi.complete({
      feature: 'ai_influencer_script',
      systemPrompt:
        'Jsi AI lovec realitních témat pro XXREALIT. Připravuješ návrhy krátkých videí s důrazem na faktickou bezpečnost a virální potenciál.',
      userPrompt,
      maxOutputTokens: 2200,
      jsonMode: true,
      adminTest: true,
    });

    const parsed = this.parseAnalysis(result.text);
    const viralScore = this.clampScore(parsed.viralScore);
    const relevanceScore = this.clampScore(parsed.relevanceScore);
    const freshnessScore = this.clampScore(parsed.freshnessScore);
    const confidenceScore = this.clampScore(parsed.confidenceScore);
    const videoPotentialScore = this.clampScore(parsed.videoPotentialScore);
    const trendBoost = parsed.trendDetected ? 8 : 0;
    const totalScore = computeTotalTopicScore({
      viralScore,
      relevanceScore,
      freshnessScore,
      confidenceScore,
      videoPotentialScore,
      trendBoost,
    });

    const safeHook = sanitizeAbsoluteClaim(parsed.proposedHook ?? '', confidenceScore);
    const safeTitle = sanitizeAbsoluteClaim(parsed.proposedTitle ?? parsed.title ?? input.title, confidenceScore);
    if (parsed.script?.hook) parsed.script.hook = sanitizeAbsoluteClaim(parsed.script.hook, confidenceScore);

    return {
      analysis: parsed,
      scores: { viralScore, relevanceScore, freshnessScore, confidenceScore, videoPotentialScore, totalScore, trendBoost },
      safeHook,
      safeTitle,
      aiCostCzk: result.estimatedCostCzk,
    };
  }

  async analyzeUrl(rawUrl: string) {
    this.log.log(`TOPIC_URL_ANALYZE ${rawUrl}`);
    const extracted = await this.urlExtract.extractFromUrl(rawUrl);
    const fingerprint = buildTopicFingerprint({
      canonicalUrl: extracted.canonicalUrl,
      title: extracted.title,
      sourceUrl: extracted.url,
    });
    const duplicate = await this.findDuplicate({
      canonicalUrl: extracted.canonicalUrl,
      title: extracted.title,
      fingerprint,
    });
    if (duplicate) {
      return { duplicate: true, candidate: duplicate };
    }

    const analyzed = await this.analyzeContent({
      title: extracted.title,
      summary: extracted.description,
      mainText: extracted.mainText,
      sourceUrl: extracted.url,
      sourceName: extracted.siteName ?? new URL(extracted.url).hostname,
      publishedAt: extracted.publishedAt,
      origin: AiInfluencerTopicOrigin.URL_IMPORT,
    });

    const candidate = await this.prisma.aiInfluencerTopicCandidate.create({
      data: {
        title: analyzed.safeTitle,
        summary: analyzed.analysis.summary ?? extracted.description,
        category: analyzed.analysis.category ?? 'Realitní téma',
        country: 'CZ',
        region: analyzed.analysis.region ?? null,
        sourceUrl: extracted.url,
        canonicalUrl: normalizeTopicUrl(extracted.canonicalUrl),
        sourceName: extracted.siteName,
        sourcePublishedAt: extracted.publishedAt ? new Date(extracted.publishedAt) : null,
        checkedAt: new Date(),
        origin: AiInfluencerTopicOrigin.URL_IMPORT,
        topicFingerprint: fingerprint,
        viralScore: analyzed.scores.viralScore,
        relevanceScore: analyzed.scores.relevanceScore,
        freshnessScore: analyzed.scores.freshnessScore,
        confidenceScore: analyzed.scores.confidenceScore,
        videoPotentialScore: analyzed.scores.videoPotentialScore,
        totalScore: analyzed.scores.totalScore,
        trendDetected: analyzed.analysis.trendDetected === true,
        status:
          analyzed.scores.totalScore >= (await this.settings.getSettings()).topicHunter.minTotalScore
            ? AiInfluencerTopicCandidateStatus.READY
            : AiInfluencerTopicCandidateStatus.DISCOVERED,
        scoreExplanation: analyzed.analysis.scoreExplanation ?? null,
        evidenceJson: {
          facts: analyzed.analysis.facts ?? [],
          accessedAt: extracted.accessedAt,
        },
        sourceJson: {
          primary: {
            name: extracted.siteName,
            url: extracted.url,
            accessedAt: extracted.accessedAt,
          },
          sources: analyzed.analysis.sources ?? [],
          images: extracted.images,
        },
        factsJson: analyzed.analysis.facts ?? [],
        proposedHook: analyzed.safeHook,
        proposedTitle: analyzed.safeTitle,
        ...(analyzed.analysis.script ? { proposedScriptJson: analyzed.analysis.script as object } : {}),
        mediaPlanJson: { images: extracted.images, ogImageUrl: extracted.ogImageUrl },
        estimatedDurationSec: analyzed.analysis.script?.estimatedDuration ?? 35,
      },
    });

    return { duplicate: false, candidate, extracted, analyzed };
  }

  async generateScriptPreview(candidateId: string) {
    const candidate = await this.getCandidate(candidateId);
    if (candidate.proposedScriptJson) {
      return {
        candidate,
        script: candidate.proposedScriptJson as ReelScriptPayload,
        cached: true,
      };
    }
    const sourceJson = candidate.sourceJson as { primary?: { url?: string; name?: string } } | null;
    const url = candidate.sourceUrl ?? sourceJson?.primary?.url;
    if (!url) throw new BadRequestException('Chybí zdrojová URL.');
    const extracted = await this.urlExtract.extractFromUrl(url);
    const analyzed = await this.analyzeContent({
      title: candidate.title,
      summary: candidate.summary ?? extracted.description,
      mainText: extracted.mainText,
      sourceUrl: url,
      sourceName: candidate.sourceName ?? extracted.siteName ?? 'Zdroj',
      publishedAt: candidate.sourcePublishedAt?.toISOString() ?? extracted.publishedAt,
      origin: candidate.origin,
    });
    const updated = await this.prisma.aiInfluencerTopicCandidate.update({
      where: { id: candidateId },
      data: {
        proposedHook: analyzed.safeHook,
        proposedTitle: analyzed.safeTitle,
        ...(analyzed.analysis.script ? { proposedScriptJson: analyzed.analysis.script as object } : {}),
        estimatedDurationSec: analyzed.analysis.script?.estimatedDuration ?? candidate.estimatedDurationSec,
        status: AiInfluencerTopicCandidateStatus.READY,
        checkedAt: new Date(),
      },
    });
    return { candidate: updated, script: analyzed.analysis.script, cached: false };
  }

  async rejectCandidate(id: string, reason?: string) {
    return this.prisma.aiInfluencerTopicCandidate.update({
      where: { id },
      data: {
        status: AiInfluencerTopicCandidateStatus.REJECTED,
        dismissedAt: new Date(),
        rejectionReason: reason ?? 'Ignorováno administrátorem',
      },
    });
  }

  async runDiscovery(options?: { manual?: boolean }) {
    if (this.discoveryRunning) {
      return { ok: false, message: 'Discovery již běží', progress: this.discoveryProgress };
    }
    const cfg = await this.settings.getSettings();
    if (!cfg.topicHunter.enabled && !options?.manual) {
      return { ok: false, message: 'AI Lovec témat je vypnutý' };
    }
    if (!this.discovery.isConfigured()) {
      throw new BadRequestException(
        'Web search provider není nakonfigurován (SERPAPI_API_KEY nebo BING_SEARCH_API_KEY).',
      );
    }

    this.discoveryRunning = true;
    this.discoveryProgress = {
      phase: 'searching',
      message: 'Hledám témata…',
      startedAt: new Date().toISOString(),
    };

    void this.executeDiscovery(cfg.topicHunter.maxProposalsPerDay, cfg.topicHunter.minTotalScore)
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.discoveryProgress = {
          phase: 'error',
          message,
          error: message,
          finishedAt: new Date().toISOString(),
        };
        this.log.error(`Discovery failed: ${message}`);
      })
      .finally(() => {
        this.discoveryRunning = false;
      });

    return { ok: true, message: 'Discovery spuštěno', progress: this.discoveryProgress };
  }

  private async executeDiscovery(maxDaily: number, minScore: number) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.aiInfluencerTopicCandidate.count({
      where: { discoveredAt: { gte: dayStart }, origin: AiInfluencerTopicOrigin.WEB_DISCOVERY },
    });
    if (todayCount >= maxDaily) {
      this.discoveryProgress = {
        phase: 'done',
        message: `Denní limit ${maxDaily} dosažen`,
        found: 0,
        finishedAt: new Date().toISOString(),
      };
      return;
    }

    let created = 0;
    const queries = TOPIC_HUNTER_SEARCH_TEMPLATES.slice(0, 6);
    for (const query of queries) {
      if (todayCount + created >= maxDaily) break;
      this.discoveryProgress = { ...this.discoveryProgress, phase: 'searching', message: `Hledám: ${query}` };
      const results = await this.discovery.search(query, 5);
      for (const hit of results) {
        if (todayCount + created >= maxDaily) break;
        const fingerprint = buildTopicFingerprint({ canonicalUrl: hit.url, title: hit.title });
        const duplicate = await this.findDuplicate({ canonicalUrl: hit.url, title: hit.title, fingerprint });
        if (duplicate) {
          this.log.log(`DUPLICATE_DETECTED ${hit.url}`);
          continue;
        }
        this.discoveryProgress = { phase: 'analyzing', message: `Analyzuji: ${hit.title.slice(0, 60)}…` };
        try {
          const extracted = await this.urlExtract.extractFromUrl(hit.url);
          this.discoveryProgress = { phase: 'fact_checking', message: 'Ověřuji fakta…' };
          const analyzed = await this.analyzeContent({
            title: extracted.title || hit.title,
            summary: extracted.description || hit.snippet,
            mainText: extracted.mainText || hit.snippet,
            sourceUrl: hit.url,
            sourceName: extracted.siteName ?? hit.provider,
            publishedAt: extracted.publishedAt,
            origin: AiInfluencerTopicOrigin.WEB_DISCOVERY,
            extraSources: [{ title: hit.title, url: hit.url, snippet: hit.snippet }],
          });
          if (analyzed.scores.totalScore < minScore) continue;
          this.discoveryProgress = { phase: 'scoring', message: 'Skóruji návrh…' };
          await this.prisma.aiInfluencerTopicCandidate.create({
            data: {
              title: analyzed.safeTitle,
              summary: analyzed.analysis.summary ?? hit.snippet,
              category: analyzed.analysis.category ?? 'Realitní téma',
              country: 'CZ',
              region: analyzed.analysis.region,
              sourceUrl: hit.url,
              canonicalUrl: normalizeTopicUrl(extracted.canonicalUrl),
              sourceName: extracted.siteName ?? hit.provider,
              sourcePublishedAt: extracted.publishedAt ? new Date(extracted.publishedAt) : null,
              checkedAt: new Date(),
              origin: AiInfluencerTopicOrigin.WEB_DISCOVERY,
              topicFingerprint: fingerprint,
              viralScore: analyzed.scores.viralScore,
              relevanceScore: analyzed.scores.relevanceScore,
              freshnessScore: analyzed.scores.freshnessScore,
              confidenceScore: analyzed.scores.confidenceScore,
              videoPotentialScore: analyzed.scores.videoPotentialScore,
              totalScore: analyzed.scores.totalScore,
              sourceCount: (analyzed.analysis.sources?.length ?? 0) + 1,
              trendDetected: analyzed.analysis.trendDetected === true,
              status: AiInfluencerTopicCandidateStatus.READY,
              scoreExplanation: analyzed.analysis.scoreExplanation,
              evidenceJson: { facts: analyzed.analysis.facts ?? [] },
              sourceJson: {
                primary: { name: hit.provider, url: hit.url, snippet: hit.snippet },
                sources: analyzed.analysis.sources ?? [],
              },
              factsJson: analyzed.analysis.facts ?? [],
              proposedHook: analyzed.safeHook,
              proposedTitle: analyzed.safeTitle,
              ...(analyzed.analysis.script ? { proposedScriptJson: analyzed.analysis.script as object } : {}),
              estimatedDurationSec: analyzed.analysis.script?.estimatedDuration ?? 35,
            },
          });
          created += 1;
          this.log.log(`CANDIDATE_CREATED ${hit.title}`);
        } catch (err) {
          this.log.warn(`SOURCE_REJECTED ${hit.url}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    await this.settings.updateSettings({
      topicHunter: {
        ...(await this.settings.getSettings()).topicHunter,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: `Nalezeno ${created} návrhů`,
      },
    });

    this.discoveryProgress = {
      phase: 'done',
      message: `Hotovo – nalezeno ${created} návrhů`,
      found: created,
      finishedAt: new Date().toISOString(),
      startedAt: this.discoveryProgress.startedAt,
    };

    const fullCfg = await this.settings.getSettings();
    if (fullCfg.topicHunter.autoCreateVideo && created > 0) {
      try {
        await this.maybeAutoCreateTopCandidate();
      } catch (err) {
        this.log.warn(`AUTO_TOPIC_VIDEO_FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  private async maybeAutoCreateTopCandidate(): Promise<void> {
    const candidate = await this.prisma.aiInfluencerTopicCandidate.findFirst({
      where: {
        status: AiInfluencerTopicCandidateStatus.READY,
        proposedScriptJson: { not: Prisma.DbNull },
        createdVideoJobId: null,
      },
      orderBy: { totalScore: 'desc' },
    });
    if (!candidate) return;
    await this.jobs.createJobFromTopicCandidate(candidate.id);
    this.log.log(`ADMIN_APPROVED auto VIDEO_JOB_CREATED ${candidate.id}`);
  }

  estimateProductionCost(durationSec: number) {
    const cfg = this.settings.getCached();
    const avatarCost = durationSec * (cfg.avatarCostPerSecCzk ?? 0.35);
    return {
      estimatedDurationSec: durationSec,
      provider: 'HeyGen',
      mode: cfg.videoGenerationMode === 'VIDEO_AGENT' ? 'Video Agent' : 'Avatar',
      estimatedCostCzk: Math.round(avatarCost * 100) / 100,
      label: 'Odhad nákladů',
    };
  }
}
