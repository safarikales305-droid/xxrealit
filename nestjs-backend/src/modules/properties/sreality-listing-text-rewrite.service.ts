import { Injectable, Logger } from '@nestjs/common';
import { OpenAiService } from '../openai/openai.service';
import type { SrealityAiTextPayload } from './sreality-import.types';
import type { SrealityListingPrefill } from './sreality-listing-prefill.util';

type RewriteJson = {
  title?: string;
  description?: string;
  skipped?: boolean;
  reason?: string;
};

@Injectable()
export class SrealityListingTextRewriteService {
  private readonly log = new Logger(SrealityListingTextRewriteService.name);

  constructor(private readonly openAi: OpenAiService) {}

  async rewriteListingText(
    prefill: SrealityListingPrefill,
  ): Promise<SrealityAiTextPayload> {
    const originalTitle = prefill.title;
    const originalDescription = prefill.description;

    if (!originalDescription?.trim() && !originalTitle?.trim()) {
      return {
        originalTitle,
        originalDescription,
        rewrittenTitle: originalTitle,
        rewrittenDescription: originalDescription,
        skipped: true,
        reason: 'Chybí text k přepracování.',
      };
    }

    const factsBlock = [
      prefill.offerType ? `Typ nabídky: ${prefill.offerType}` : null,
      prefill.propertyType ? `Typ nemovitosti: ${prefill.propertyType}` : null,
      prefill.subType ? `Dispozice/podtyp: ${prefill.subType}` : null,
      prefill.price != null ? `Cena: ${prefill.price} ${prefill.currency ?? 'CZK'}` : null,
      prefill.area != null ? `Plocha: ${prefill.area} m²` : null,
      prefill.landArea != null ? `Pozemek: ${prefill.landArea} m²` : null,
      prefill.city ? `Město: ${prefill.city}` : null,
      prefill.district ? `Část obce: ${prefill.district}` : null,
      prefill.region ? `Kraj: ${prefill.region}` : null,
      prefill.floor != null ? `Patro: ${prefill.floor}` : null,
      prefill.condition ? `Stav: ${prefill.condition}` : null,
      prefill.equipment ? `Vybavení: ${prefill.equipment}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const result = await this.openAi.complete({
        feature: 'sreality_import_text_rewrite',
        systemPrompt:
          'Jsi redaktor portálu XXREALIT. Přepisuješ popis nemovitosti pro vlastní portál. NESMÍŠ měnit žádná faktická data (cenu, plochu, lokalitu, dispozici, stav, vybavení, jména, kontakty). Můžeš měnit stylistiku, pořadí vět, úvod a marketingové formulace. Vrať pouze validní JSON.',
        userPrompt: `Přepracuj text inzerátu pro XXREALIT. Fakta musí zůstat stejná.

FAKTICKÁ DATA (neměnit):
${factsBlock}

PŮVODNÍ NADPIS:
${originalTitle ?? '—'}

PŮVODNÍ POPIS:
${(originalDescription ?? '').slice(0, 8000)}

Vrať JSON:
{
  "title": "nový nadpis",
  "description": "nový popis",
  "skipped": false,
  "reason": null
}`,
        maxOutputTokens: 1200,
        jsonMode: true,
        adminTest: true,
      });

      const parsed = JSON.parse(result.text) as RewriteJson;
      return {
        originalTitle,
        originalDescription,
        rewrittenTitle: parsed.title?.trim() || originalTitle,
        rewrittenDescription: parsed.description?.trim() || originalDescription,
        skipped: parsed.skipped === true,
        reason: parsed.reason ?? undefined,
      };
    } catch (err) {
      this.log.warn(
        `AI text rewrite failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        originalTitle,
        originalDescription,
        rewrittenTitle: originalTitle,
        rewrittenDescription: originalDescription,
        skipped: true,
        reason: 'AI přepis selhal — použit původní text.',
      };
    }
  }
}
