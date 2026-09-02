import type { ArticleScoreResult, ReelScriptPayload } from '../ai-influencer.types';

export type ArticleForReel = {
  id: string;
  title: string;
  perex: string;
  bodyMarkdown: string;
  category: string;
  region: string | null;
  publishedAt: Date | null;
  ogImageUrl: string | null;
  factClaimsJson: unknown;
};

export interface AiScriptProvider {
  evaluateArticle(article: ArticleForReel): Promise<{
    result: ArticleScoreResult;
    costCzk: number;
  }>;
  generateScript(input: {
    article: ArticleForReel;
    targetDurationSec: number;
    personalityPrompt?: string | null;
    performanceHints?: string[];
  }): Promise<{
    script: ReelScriptPayload;
    hookCandidates: string[];
    selectedHook: string;
    costCzk: number;
    scriptHash: string;
  }>;
}
