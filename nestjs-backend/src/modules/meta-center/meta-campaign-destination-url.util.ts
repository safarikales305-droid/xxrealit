import type { CreateMetaCampaignDto } from './dto/create-meta-campaign.dto';
import { normalizeCreativePayload } from './meta-campaign-creative.util';

export function resolveMetaCampaignDestinationUrls(
  dto: CreateMetaCampaignDto,
  options?: {
    frontendBase?: string;
    productDetailUrls?: string[];
  },
): string[] {
  const payload = normalizeCreativePayload(
    (dto.creativePayload ?? undefined) as Record<string, unknown> | undefined,
  );
  const explicit = (payload.link || payload.detailUrl || '').trim();
  const urls = new Set<string>();
  if (explicit) urls.add(explicit);
  for (const detailUrl of options?.productDetailUrls ?? []) {
    const trimmed = detailUrl.trim();
    if (trimmed) urls.add(trimmed);
  }
  return [...urls];
}

export function buildPropertyDetailUrl(
  frontendBase: string,
  property: { id: string; slug?: string | null },
): string {
  const base = frontendBase.replace(/\/+$/, '');
  const path = property.slug?.trim()
    ? `/nemovitosti/${property.slug.trim()}`
    : `/nemovitost/${property.id}`;
  return `${base}${path}`;
}
