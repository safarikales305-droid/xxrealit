import { Injectable, Logger } from '@nestjs/common';
import type { ReelHookMode } from '@prisma/client';
import { OpenAiService } from '../openai/openai.service';
import { templateReelHookText } from './reel-title.util';

@Injectable()
export class ReelHookService {
  private readonly log = new Logger(ReelHookService.name);

  constructor(private readonly openAi: OpenAiService) {}

  async generateHookText(input: {
    titles: string[];
    categoryLabel?: string | null;
    channelTitles?: string[];
    mode?: ReelHookMode;
  }): Promise<string> {
    const mode = input.mode ?? 'AI_FALLBACK';
    const fallback = templateReelHookText({
      titles: input.titles,
      categoryLabel: input.categoryLabel,
    });

    if (mode === 'TEMPLATE') return fallback;

    try {
      const userPrompt = `Vytvoř jeden krátký poutavý headline pro Facebook Reel o realitách a bydlení.
Max 5–9 slov, česky, VELKÝMI PÍSMENY, bez clickbait lží, musí odpovídat videím.
Videa: ${input.titles.slice(0, 5).join(' | ')}
Kategorie: ${input.categoryLabel ?? 'realitní trh'}
Kanály: ${(input.channelTitles ?? []).slice(0, 3).join(', ')}
Vrať pouze headline, nic jiného.`;

      const result = await this.openAi.complete({
        feature: 'editorial_reel_hook',
        systemPrompt:
          'Jsi copywriter pro český realitní portál XXREALIT. Píšeš krátké hooky pro Facebook Reels.',
        userPrompt,
        maxOutputTokens: 40,
        adminTest: true,
      });

      const hook = result.text?.trim().replace(/^["']|["']$/g, '').slice(0, 80).toUpperCase();
      const wordCount = hook ? hook.split(/\s+/).length : 0;
      if (hook && wordCount >= 3 && wordCount <= 12) {
        return hook;
      }
      return fallback;
    } catch (err) {
      this.log.warn(`AI hook failed: ${err instanceof Error ? err.message : err}`);
      return fallback;
    }
  }
}
