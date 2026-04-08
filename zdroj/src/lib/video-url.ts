export function normalizePublicVideoUrl(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;
  const u = input.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u) || u.startsWith('//')) return u;
  return null;
}

export function resolveShortsPublicSrc(
  item: { videoUrl: string | null | undefined },
): string | null {
  return normalizePublicVideoUrl(item.videoUrl);
}
