/** Skóre pro výběr prvního videa ve Facebook Reel (vyšší = lepší úvod). */
export function scoreReelLeadSegment(input: {
  publishedAt?: Date | string | null;
  title?: string | null;
  thumbnailUrl?: string | null;
  categoryLabel?: string | null;
  relevanceScore?: number | null;
  viewCount?: number | null;
}): number {
  let score = 0;
  const published = input.publishedAt ? new Date(input.publishedAt).getTime() : 0;
  if (published > 0) {
    const ageHours = (Date.now() - published) / (60 * 60 * 1000);
    score += Math.max(0, 100 - ageHours * 2);
  }
  if (input.relevanceScore != null) score += Math.min(50, input.relevanceScore);
  if (input.thumbnailUrl?.trim()) score += 15;
  if ((input.title?.trim().length ?? 0) >= 20) score += 5;
  if (input.categoryLabel?.trim()) score += 5;
  if (input.viewCount != null && input.viewCount > 0) {
    score += Math.min(20, Math.log10(input.viewCount + 1) * 5);
  }
  return score;
}

export function sortPostsForReelLead<
  T extends {
    id: string;
    title: string;
    youtubeThumbnailUrl?: string | null;
    youtubeVideoId?: string | null;
    publishedAt?: Date | null;
    newsSource?: {
      contentCategory?: { label: string } | null;
    } | null;
  },
>(posts: T[]): T[] {
  if (posts.length <= 1) return posts;
  const scored = posts.map((post) => ({
    post,
    score: scoreReelLeadSegment({
      publishedAt: post.publishedAt,
      title: post.title,
      thumbnailUrl:
        post.youtubeThumbnailUrl ??
        (post.youtubeVideoId ? `https://i.ytimg.com/vi/${post.youtubeVideoId}/hqdefault.jpg` : null),
      categoryLabel: post.newsSource?.contentCategory?.label ?? null,
    }),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.post);
}
