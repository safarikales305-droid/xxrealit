import { nestAbsoluteAssetUrl } from '@/lib/api';
import { propertyListingHasVideo } from '@/lib/property-feed-filters';
import type { ShortVideo } from '@/lib/nest-client';
import type { PropertyFeedItem } from '@/types/property';

/** Absolutní URL videa pro shorts záznam (prázdné = nejde přehrát). */
export function shortVideoPlayableSrc(video: ShortVideo): string {
  return nestAbsoluteAssetUrl(video.videoUrl ?? video.url ?? '').trim();
}

export function isShortVideoPlayable(video: ShortVideo): boolean {
  return shortVideoPlayableSrc(video).length > 0;
}

/** Primární URL videa pro položku z API (relativní i absolutní; v produkci http→https přes `nestAbsoluteAssetUrl`). */
export function propertyFeedPrimaryVideoSrc(p: PropertyFeedItem): string {
  const direct = (p.videoUrl ?? '').trim();
  if (direct) return nestAbsoluteAssetUrl(direct).trim();
  const mediaVideo = p.media?.find((m) => m.type === 'video' && typeof m.url === 'string' && m.url.trim());
  if (mediaVideo?.url) return nestAbsoluteAssetUrl(mediaVideo.url).trim();
  return '';
}

export function isPropertyFeedVideoPlayable(p: PropertyFeedItem): boolean {
  return propertyFeedPrimaryVideoSrc(p).length > 0;
}

/** Položky bez videa necháme; u „video“ inzerátů vyřadíme ty bez použitelné URL. */
export function propertyRowPassesVideoFeedGate(p: PropertyFeedItem): boolean {
  if (!propertyListingHasVideo(p)) return true;
  return isPropertyFeedVideoPlayable(p);
}

/** Další index ve smyčce [0, length). */
export function nextLoopIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return (index + 1) % length;
}

/**
 * Další index v kruhu, který přeskočí položky s id v `excludedIds`.
 * Pokud jsou všechny vyloučené, vrátí `startIndex`.
 */
export function nextLoopIndexSkipping<T>(
  items: readonly T[],
  startIndex: number,
  getId: (item: T) => string,
  excludedIds: ReadonlySet<string>,
): number {
  const n = items.length;
  if (n === 0) return 0;
  let idx = nextLoopIndex(startIndex, n);
  for (let step = 0; step < n; step++) {
    if (!excludedIds.has(getId(items[idx]!))) return idx;
    idx = nextLoopIndex(idx, n);
  }
  return startIndex;
}
