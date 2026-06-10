import { nestAbsoluteAssetUrl } from '@/lib/api';

type PosterSource = {
  posterUrl?: string | null;
  thumbnailUrl?: string | null;
  thumbnail?: string | null;
  imageUrl?: string | null;
  cover?: string | null;
  images?: string[] | null;
};

/** Náhled / poster pro Shorts, dokud není video připravené. */
export function resolveShortsPosterUrl(source: PosterSource): string {
  const candidates: Array<string | null | undefined> = [
    source.posterUrl,
    source.thumbnailUrl,
    source.thumbnail,
    source.imageUrl,
    source.cover,
    ...(source.images ?? []),
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) {
      return nestAbsoluteAssetUrl(raw.trim()).trim();
    }
  }
  return '';
}
