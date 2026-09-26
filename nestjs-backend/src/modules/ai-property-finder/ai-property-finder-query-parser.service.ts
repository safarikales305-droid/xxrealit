import { Injectable } from '@nestjs/common';
import { OpenAiService } from '../openai/openai.service';
import {
  mergeSeoContextIntoCriteria,
} from './ai-property-finder-seo-context.util';
import type { ParsedPropertySearchCriteria, SeoPageSearchContext } from './ai-property-finder.types';

@Injectable()
export class AiPropertyFinderQueryParserService {
  constructor(private readonly openAi: OpenAiService) {}

  async parse(input: {
    query: string;
    seoContext?: SeoPageSearchContext | null;
    previousCriteria?: ParsedPropertySearchCriteria | null;
  }): Promise<{ criteria: ParsedPropertySearchCriteria; clarifyingQuestion?: string }> {
    const trimmed = input.query.trim();
    const heuristic = this.parseHeuristic(trimmed, input.seoContext, input.previousCriteria);
    if (trimmed.length < 4 && !input.seoContext) {
      return {
        criteria: heuristic,
        clarifyingQuestion: 'Kde přibližně chcete bydlet a jaký máte maximální rozpočet?',
      };
    }
    if (trimmed.split(/\s+/).length <= 2 && !heuristic.priceMax && !input.seoContext?.locationName) {
      return {
        criteria: heuristic,
        clarifyingQuestion: 'Upřesněte prosím lokalitu nebo maximální cenu.',
      };
    }

    try {
      const ai = await this.openAi.complete({
        feature: 'ai_chat',
        systemPrompt:
          'Převádíš české dotazy na hledání nemovitostí do JSON. Nevymýšlej inzeráty. Pouze strukturovaná kritéria.',
        userPrompt: `Dotaz: "${trimmed}"
SEO kontext: ${JSON.stringify(input.seoContext ?? null)}
Předchozí kritéria: ${JSON.stringify(input.previousCriteria ?? null)}

Vrať JSON:
{
  "transaction": "sale"|"rent"|null,
  "propertyType": "...",
  "propertyTypeKey": "byt"|"dum"|"pozemek"|"chata_chalupa"|null,
  "location": "...",
  "radiusKm": number|null,
  "priceMin": number|null,
  "priceMax": number|null,
  "dispositionMin": "3+kk"|null,
  "areaMin": number|null,
  "garden": boolean|null,
  "condition": string[]
}`,
        maxOutputTokens: 600,
        jsonMode: true,
        adminTest: true,
      });
      const parsed = this.extractJson(ai.text) as ParsedPropertySearchCriteria;
      const merged = mergeSeoContextIntoCriteria(input.seoContext, {
        ...heuristic,
        ...parsed,
        rawQuery: trimmed,
      });
      return { criteria: merged };
    } catch {
      return { criteria: mergeSeoContextIntoCriteria(input.seoContext, { ...heuristic, rawQuery: trimmed }) };
    }
  }

  private parseHeuristic(
    query: string,
    seo?: SeoPageSearchContext | null,
    previous?: ParsedPropertySearchCriteria | null,
  ): ParsedPropertySearchCriteria {
    const q = query.toLowerCase();
    const base: ParsedPropertySearchCriteria = { ...(previous ?? {}), rawQuery: query };

    const milMatch = q.match(/do\s+(\d+(?:[.,]\d+)?)\s*(mil|milión|milion|mio)/i);
    if (milMatch) {
      base.priceMax = Math.round(Number.parseFloat(milMatch[1].replace(',', '.')) * 1_000_000);
    }
    const czkMatch = q.match(/do\s+(\d[\d\s]*)\s*(kč|czk)/i);
    if (czkMatch && !base.priceMax) {
      base.priceMax = Number.parseInt(czkMatch[1].replace(/\s/g, ''), 10);
    }

    const kmMatch = q.match(/(\d+)\s*km/i);
    if (kmMatch) base.radiusKm = Number.parseInt(kmMatch[1], 10);

    const disp = q.match(/(\d+\+kk|\d+\+1)/i);
    if (disp) base.dispositionMin = disp[1];

    if (q.includes('zahrad')) base.garden = true;
    if (q.includes('byt')) base.propertyTypeKey = 'byt';
    if (q.includes('dům') || q.includes('dum ') || q.startsWith('dum')) base.propertyTypeKey = 'dum';
    if (q.includes('chalup') || q.includes('chat')) base.propertyTypeKey = 'chata_chalupa';
    if (q.includes('pozem')) base.propertyTypeKey = 'pozemek';
    if (q.includes('pronájem') || q.includes('pronajem')) base.transaction = 'rent';
    if (q.includes('prodej')) base.transaction = 'sale';

    const areaMatch = q.match(/(\d+)\s*m²|(\d+)\s*m2/i);
    if (areaMatch) base.areaMin = Number.parseInt(areaMatch[1] ?? areaMatch[2], 10);

    return mergeSeoContextIntoCriteria(seo, base);
  }

  private extractJson(text: string): Record<string, unknown> {
    const t = text.trim();
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  }
}
