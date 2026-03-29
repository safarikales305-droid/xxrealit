import type { PropertyFeedItem } from '@/types/property';

/** Context for client-side feed ordering when the API returns an unranked list. */
export type PersonalizeContext = {
  userId: string;
  followingUserIds: string[];
  userCity: string | null;
  referencePrice: number;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Re-ranks listings for the logged-in viewer (mirrors backend scoring roughly).
 * Use when you have social context but only a flat property list.
 */
export function getPersonalizedFeed(
  items: PropertyFeedItem[],
  ctx: PersonalizeContext | null,
): PropertyFeedItem[] {
  if (!ctx || items.length === 0) {
    return items;
  }

  const following = new Set(ctx.followingUserIds);
  const ref = ctx.referencePrice > 0 ? ctx.referencePrice : 5_000_000;
  const uc = ctx.userCity ? norm(ctx.userCity) : '';

  const scored = items.map((p) => {
    let s = 0;
    if (p.userId && following.has(p.userId)) s += 100;
    if (uc && norm(p.location).includes(uc)) s += 25;
    if (p.ownerCity && uc && norm(p.ownerCity) === uc) s += 15;
    if (ref > 0) {
      const ratio = p.price / ref;
      if (ratio >= 0.65 && ratio <= 1.35) s += 25;
    }
    s += Math.random() * 10;
    return { p, s };
  });

  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.p);
}
