import { loadPropertyFeedItems } from '@/lib/load-feed';
import { API_BASE_URL } from '@/lib/api';
import { propertyListingHasVideo } from '@/lib/property-feed-filters';
import { classicListingCoverUrl, type PropertyFeedItem } from '@/types/property';

/** Maskovaná cena pro nepřihlášené — nikdy nezobrazovat skutečnou hodnotu. */
export const AUTH_DECOR_MASKED_PRICE = '••• ••• Kč';

const DESKTOP_POSITIONS = [
  'left-[3%] top-[12%] hidden lg:block',
  'right-[2%] top-[10%] hidden xl:block',
  'right-[4%] top-[36%] hidden lg:block',
  'left-[4%] bottom-[16%] hidden xl:block',
  'left-[6%] top-[40%] hidden lg:block',
  'right-[3%] bottom-[12%] hidden lg:block',
  'left-[1%] bottom-[6%] hidden 2xl:block',
  'right-[8%] bottom-[30%] hidden 2xl:block',
] as const;

export type AuthDecorCard = {
  key: string;
  title: string;
  location: string;
  propertyType: string;
  kind: 'listing' | 'short';
  coverPath: string | null;
  positionClass: string;
};

function resolvePropertyType(p: PropertyFeedItem): string {
  if (p.propertyTypeLabel?.trim()) return p.propertyTypeLabel.trim();
  const key = p.propertyTypeKey?.trim().toLowerCase();
  const labels: Record<string, string> = {
    byt: 'Byt',
    dum: 'Dům',
    pozemek: 'Pozemek',
  };
  if (key && labels[key]) return labels[key];
  return propertyListingHasVideo(p) ? 'Video' : 'Nemovitost';
}

function resolveLocation(p: PropertyFeedItem): string {
  const loc = (p.location ?? p.address ?? '').trim();
  return loc || 'Česká republika';
}

function pickDecorItems(items: PropertyFeedItem[], max: number): PropertyFeedItem[] {
  const shorts = items.filter((p) => propertyListingHasVideo(p));
  const classics = items.filter((p) => !propertyListingHasVideo(p));
  const picked: PropertyFeedItem[] = [];
  let si = 0;
  let ci = 0;

  while (picked.length < max && (si < shorts.length || ci < classics.length)) {
    if (picked.length % 3 === 2 && si < shorts.length) {
      picked.push(shorts[si]!);
      si += 1;
    } else if (ci < classics.length) {
      picked.push(classics[ci]!);
      ci += 1;
    } else if (si < shorts.length) {
      picked.push(shorts[si]!);
      si += 1;
    } else {
      break;
    }
  }

  return picked;
}

function resolveCoverPath(p: PropertyFeedItem): string | null {
  return classicListingCoverUrl(p);
}

export function mapPropertyToDecorCard(
  p: PropertyFeedItem,
  positionClass: string,
): AuthDecorCard {
  const isShort = propertyListingHasVideo(p);
  return {
    key: p.id,
    title: (p.title ?? '').trim() || 'Inzerát',
    location: resolveLocation(p),
    propertyType: resolvePropertyType(p),
    kind: isShort ? 'short' : 'listing',
    coverPath: resolveCoverPath(p),
    positionClass,
  };
}

/** Načte aktivní veřejné inzeráty pro dekorativní karty na login/registraci. */
export async function loadAuthDecorCards(): Promise<AuthDecorCard[]> {
  if (!API_BASE_URL) return [];

  const { items } = await loadPropertyFeedItems(API_BASE_URL, {
    path: '/properties',
  });
  if (!items.length) return [];

  const picked = pickDecorItems(items, DESKTOP_POSITIONS.length);
  return picked.map((p, index) =>
    mapPropertyToDecorCard(p, DESKTOP_POSITIONS[index] ?? DESKTOP_POSITIONS[0]),
  );
}
