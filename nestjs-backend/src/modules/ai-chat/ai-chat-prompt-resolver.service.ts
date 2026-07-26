import { Injectable, Logger } from '@nestjs/common';
import { AiPromptStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  DEFAULT_INTENT_CLASSIFICATION_PROMPT,
  DEFAULT_MAIN_CHAT_PROMPT,
  DEFAULT_PROFILE_EXTRACTION_PROMPT,
  DEFAULT_PROPERTY_SEARCH_PROMPT,
  normalizePromptFeature,
} from './ai-chat-default-prompts';
import { AI_CHAT_PROMPT_FEATURES } from './ai-chat.constants';
import { renderPromptTemplate, validatePromptVariables } from './ai-chat-prompt-variables.util';

const BUILTIN_FALLBACKS: Record<string, string> = {
  [AI_CHAT_PROMPT_FEATURES.MAIN_CHAT]: DEFAULT_MAIN_CHAT_PROMPT,
  [AI_CHAT_PROMPT_FEATURES.INTENT_CLASSIFICATION]: DEFAULT_INTENT_CLASSIFICATION_PROMPT,
  [AI_CHAT_PROMPT_FEATURES.PROPERTY_SEARCH]: DEFAULT_PROPERTY_SEARCH_PROMPT,
  [AI_CHAT_PROMPT_FEATURES.PROFILE_EXTRACTION]: DEFAULT_PROFILE_EXTRACTION_PROMPT,
};

export type ResolvedPrompt = {
  id: string | null;
  feature: string;
  version: string;
  systemPrompt: string;
  source: 'database' | 'builtin';
};

@Injectable()
export class AiChatPromptResolverService {
  private readonly log = new Logger(AiChatPromptResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveActive(
    feature: string,
    vars?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<ResolvedPrompt> {
    const normalized = normalizePromptFeature(feature);

    try {
      const active = await this.prisma.aiPromptVersion.findFirst({
        where: { feature: normalized, status: AiPromptStatus.ACTIVE },
        orderBy: { activatedAt: 'desc' },
      });
      if (active) {
        const rendered = vars
          ? renderPromptTemplate(active.systemPrompt, vars)
          : active.systemPrompt;
        return {
          id: active.id,
          feature: normalized,
          version: active.version,
          systemPrompt: rendered,
          source: 'database',
        };
      }
    } catch (err) {
      this.log.warn(
        `DB prompt load selhal (${normalized}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const fallback = BUILTIN_FALLBACKS[normalized] ?? BUILTIN_FALLBACKS[AI_CHAT_PROMPT_FEATURES.MAIN_CHAT];
    const rendered = vars ? renderPromptTemplate(fallback, vars) : fallback;
    return {
      id: null,
      feature: normalized,
      version: 'builtin-v1',
      systemPrompt: rendered,
      source: 'builtin',
    };
  }

  validateBeforeActivate(content: string) {
    const result = validatePromptVariables(content);
    if (!result.valid) {
      throw new Error(`Neznámé proměnné v promptu: ${result.unknown.join(', ')}`);
    }
  }
}
