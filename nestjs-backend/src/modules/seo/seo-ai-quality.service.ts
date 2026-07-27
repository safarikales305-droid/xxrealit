import { Injectable } from '@nestjs/common';
import type { SeoAiPageOutput } from './seo-ai-layout.types';

export type SeoQualityResult = {
  qualityScore: number;
  uniquenessScore: number;
  duplicateRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  similarPageIds: string[];
  recommendedStatus: 'PUBLISHED' | 'REVIEW' | 'DRAFT' | 'NEEDS_IMPROVEMENT';
  indexable: boolean;
  reasons: string[];
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

@Injectable()
export class SeoAiQualityService {
  scorePage(
    output: SeoAiPageOutput,
    context: {
      hasListings: boolean;
      listingCount: number;
      similarPages: Array<{
        id: string;
        title: string | null;
        description: string | null;
        h1: string | null;
        bodyText: string | null;
      }>;
      indexImmediately?: boolean;
      minPublishScore?: number;
    },
  ): SeoQualityResult {
    const reasons: string[] = [];
    let qualityScore = 0;

    if (output.metaTitle.length >= 45 && output.metaTitle.length <= 60) qualityScore += 10;
    else if (output.metaTitle.length >= 35) qualityScore += 6;
    else reasons.push('Meta title mimo doporučenou délku.');

    if (output.metaDescription.length >= 120 && output.metaDescription.length <= 160) qualityScore += 10;
    else if (output.metaDescription.length >= 90) qualityScore += 6;
    else reasons.push('Meta description mimo doporučenou délku.');

    if (output.h1.length >= 10) qualityScore += 8;
    if (output.editorialTitle.length >= 20) qualityScore += 8;
    if (output.introText.length >= 120) qualityScore += 10;
    if (output.mainContent.length >= 600) qualityScore += 12;
    else if (output.mainContent.length >= 400) qualityScore += 8;

    if (output.blocks.length >= 6) qualityScore += 10;
    else if (output.blocks.length >= 4) qualityScore += 6;

    if (output.faq.length >= 4) qualityScore += 8;
    if (output.internalLinks.length >= 3) qualityScore += 6;
    if (output.cta.title && output.cta.text) qualityScore += 5;

    if (context.hasListings) qualityScore += 8;
    else if (output.blocks.some((b) => b.type === 'NO_LISTINGS_GUIDE')) qualityScore += 6;

    const verifiedClaims = output.sourceClaims.filter((c) => c.verified).length;
    if (verifiedClaims > 0) qualityScore += Math.min(8, verifiedClaims * 2);

    qualityScore = Math.min(100, qualityScore);

    const newText = [
      output.metaTitle,
      output.metaDescription,
      output.h1,
      output.introText,
      output.mainContent,
      ...output.faq.map((f) => `${f.question} ${f.answer}`),
    ].join(' ');
    const newTokens = tokenize(newText);

    let maxSimilarity = 0;
    const similarPageIds: string[] = [];
    for (const page of context.similarPages) {
      const existingText = [page.title, page.description, page.h1, page.bodyText].filter(Boolean).join(' ');
      const sim = jaccard(newTokens, tokenize(existingText));
      if (sim > 0.45) similarPageIds.push(page.id);
      if (sim > maxSimilarity) maxSimilarity = sim;
    }

    const uniquenessScore = Math.round(Math.max(0, Math.min(100, (1 - maxSimilarity) * 100)));
    let duplicateRisk: SeoQualityResult['duplicateRisk'] = 'LOW';
    if (uniquenessScore < 65) duplicateRisk = 'HIGH';
    else if (uniquenessScore < 80) duplicateRisk = 'MEDIUM';

    let recommendedStatus: SeoQualityResult['recommendedStatus'] = 'DRAFT';
    let indexable = false;

    const minPublish = context.minPublishScore ?? 75;
    if (qualityScore >= 90 && uniquenessScore >= 80) {
      recommendedStatus = 'PUBLISHED';
      indexable = Boolean(context.indexImmediately);
    } else if (qualityScore >= minPublish && uniquenessScore >= 75) {
      recommendedStatus = 'REVIEW';
    } else if (qualityScore >= 60 && uniquenessScore >= 65) {
      recommendedStatus = 'DRAFT';
    } else {
      recommendedStatus = 'NEEDS_IMPROVEMENT';
      reasons.push('Nízké skóre kvality nebo unikátnosti.');
    }

    if (duplicateRisk === 'HIGH') {
      recommendedStatus = 'NEEDS_IMPROVEMENT';
      indexable = false;
      reasons.push('Vysoké riziko duplicity.');
    }

    return {
      qualityScore,
      uniquenessScore,
      duplicateRisk,
      similarPageIds,
      recommendedStatus,
      indexable,
      reasons,
    };
  }

  estimateBatchCostCzk(pageCount: number): { estimatedTokens: number; estimatedCostCzk: number } {
    const tokensPerPage = 4500;
    const estimatedTokens = pageCount * tokensPerPage;
    const estimatedCostCzk = Math.round(pageCount * 1.2 * 100) / 100;
    return { estimatedTokens, estimatedCostCzk };
  }
}
