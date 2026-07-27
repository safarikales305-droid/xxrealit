import type { SeoAiPageOutput } from './seo-ai-layout.types';
import {
  buildSeoAiPageFromAi,
  type SeoAiBuildContext,
  type SeoAiBuildLog,
} from './seo-ai-page.builder';

export type { SeoAiBuildContext, SeoAiBuildLog };

export function parseSeoAiPageJson(text: string): unknown {
  const trimmed = text.trim();
  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = jsonBlock ? jsonBlock[1].trim() : trimmed;
  return JSON.parse(candidate);
}

/** @deprecated Použij buildSeoAiPageFromAi — validace bloků už neblokuje generování. */
export function validateSeoAiPageOutput(
  raw: unknown,
  opts?: { hasListings?: boolean; context?: SeoAiBuildContext },
): { ok: true; data: SeoAiPageOutput; log: SeoAiBuildLog } {
  const ctx: SeoAiBuildContext = {
    locationName: opts?.context?.locationName ?? 'Lokalita',
    offerLabel: opts?.context?.offerLabel ?? 'Reality',
    hasListings: opts?.hasListings ?? opts?.context?.hasListings ?? false,
    intentSlug: opts?.context?.intentSlug,
    relatedLocations: opts?.context?.relatedLocations,
  };
  const { output, log } = buildSeoAiPageFromAi(raw, ctx);
  return { ok: true, data: output, log };
}
