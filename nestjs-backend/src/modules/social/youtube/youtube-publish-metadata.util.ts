import { getSiteOriginForOg } from '../../properties/property-og-media.util';
import { templateReelHookText } from '../../editorial-reel/reel-title.util';
import type { YoutubePrivacyStatus } from './youtube.constants';

export type YouTubeReelMetadataInput = {
  title: string | null;
  segments: Array<{
    title: string | null;
    channelTitle?: string | null;
    categoryLabel?: string | null;
  }>;
  categoryLabel?: string | null;
  shortsCollectionId?: string | null;
};

export function buildYouTubeReelTitle(input: YouTubeReelMetadataInput): string {
  const direct = input.title?.trim();
  if (direct && direct.length >= 12 && !/^co je nového ve světě realit$/i.test(direct)) {
    return direct.slice(0, 100);
  }
  const titles = input.segments.map((s) => s.title?.trim()).filter(Boolean) as string[];
  const hook = templateReelHookText({ titles, categoryLabel: input.categoryLabel });
  const normalized = hook
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  if (titles.length >= 3) {
    return `${titles.length} realitních novinek, které stojí za pozornost`.slice(0, 100);
  }
  return normalized.slice(0, 100);
}

export function buildYouTubeReelDescription(input: YouTubeReelMetadataInput): string {
  const origin = getSiteOriginForOg();
  const collectionUrl = input.shortsCollectionId
    ? `${origin}/?tab=shorts&collection=${encodeURIComponent(input.shortsCollectionId)}`
    : `${origin}/?tab=shorts`;
  const titles = input.segments.map((s) => s.title?.trim()).filter(Boolean).slice(0, 5);
  const summary =
    titles.length > 0
      ? `Krátké shrnutí: ${titles.join(' · ')}`
      : 'Krátké shrnutí realitních novinek a tipů z XXREALIT.';

  return [
    summary,
    '',
    'Zdroj: XXREALIT',
    '',
    'Další reality, videa a novinky:',
    collectionUrl,
    '',
    '#reality #bydleni #nemovitosti #xxrealit',
  ].join('\n');
}

export function buildYouTubeReelTags(input: YouTubeReelMetadataInput): string[] {
  const tags = new Set<string>(['reality', 'bydlení', 'nemovitosti', 'xxrealit', 'shorts']);
  if (input.categoryLabel?.trim()) {
    tags.add(input.categoryLabel.trim().toLowerCase().slice(0, 30));
  }
  for (const seg of input.segments) {
    if (seg.channelTitle?.trim()) tags.add(seg.channelTitle.trim().slice(0, 30));
    const t = seg.title?.trim();
    if (t) {
      const words = t.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      for (const w of words.slice(0, 2)) tags.add(w.slice(0, 30));
    }
  }
  return [...tags].slice(0, 12);
}

export function normalizeYoutubePrivacy(raw: unknown): YoutubePrivacyStatus {
  const v = String(raw ?? 'private').toLowerCase();
  if (v === 'public' || v === 'unlisted') return v;
  return 'private';
}
