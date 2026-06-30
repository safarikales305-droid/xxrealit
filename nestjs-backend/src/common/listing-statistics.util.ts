export type PropertyViewsParts = {
  realViews?: number | null;
  manualViews?: number | null;
  autopilotViews?: number | null;
  viewsCount?: number | null;
};

export type PostLikesParts = {
  realLikes?: number | null;
  manualLikes?: number | null;
  autopilotLikes?: number | null;
};

export function propertyTotalViews(p: PropertyViewsParts): number {
  const real = Math.max(0, Math.trunc(Number(p.realViews ?? 0)));
  const manual = Math.max(0, Math.trunc(Number(p.manualViews ?? 0)));
  const autopilot = Math.max(0, Math.trunc(Number(p.autopilotViews ?? 0)));
  const sum = real + manual + autopilot;
  if (sum > 0) return sum;
  return Math.max(0, Math.trunc(Number(p.viewsCount ?? 0)));
}

export function postTotalLikes(p: PostLikesParts, reactionLikeCount?: number): number {
  const real =
    reactionLikeCount != null
      ? Math.max(0, Math.trunc(reactionLikeCount))
      : Math.max(0, Math.trunc(Number(p.realLikes ?? 0)));
  const manual = Math.max(0, Math.trunc(Number(p.manualLikes ?? 0)));
  const autopilot = Math.max(0, Math.trunc(Number(p.autopilotLikes ?? 0)));
  return real + manual + autopilot;
}

export function randomIntInRange(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function dayKeyUtc(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function isShortsListing(row: {
  listingType?: string | null;
  videoUrl?: string | null;
}): boolean {
  if (row.listingType === 'SHORTS') return true;
  const video = (row.videoUrl ?? '').trim();
  return video.length > 0;
}
