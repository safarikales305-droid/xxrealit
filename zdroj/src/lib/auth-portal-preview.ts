import { loadPropertyFeedItems } from '@/lib/load-feed';
import { API_BASE_URL, nestAbsoluteAssetUrl } from '@/lib/api';
import {
  loadAuthDecorCards,
  mapPropertyToDecorCard,
  type AuthDecorCard,
} from '@/lib/auth-decor-listings';
import { nestFetchCommunityPosts, nestListPublicStories, nestFetchPublicPromoProfiles, type ListingPost } from '@/lib/nest-client';
import { propertyListingHasVideo } from '@/lib/property-feed-filters';
import { classicListingCoverUrl, type PropertyFeedItem } from '@/types/property';
import { isFacebookVideoPost } from '@/lib/facebook-post-media';

export type AuthPortalPreviewItem = {
  id: string;
  title: string;
  subtitle: string;
  kind: 'listing' | 'short' | 'post' | 'story' | 'facebook' | 'promo';
  coverUrl: string | null;
  videoUrl: string | null;
  href: string;
  hasLiveMedia: boolean;
  positionClass?: string;
};

const DESKTOP_POSITIONS = [
  'left-[2%] top-[8%] hidden lg:block',
  'right-[1%] top-[6%] hidden xl:block',
  'right-[3%] top-[34%] hidden lg:block',
  'left-[3%] bottom-[14%] hidden xl:block',
  'left-[5%] top-[38%] hidden lg:block',
  'right-[2%] bottom-[10%] hidden lg:block',
  'left-[0.5%] bottom-[4%] hidden 2xl:block',
  'right-[7%] bottom-[28%] hidden 2xl:block',
  'left-[12%] top-[18%] hidden 2xl:block',
  'right-[12%] top-[52%] hidden 2xl:block',
  'left-[18%] bottom-[22%] hidden 2xl:block',
  'right-[16%] top-[20%] hidden 2xl:block',
] as const;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function postCover(post: ListingPost): string | null {
  const thumb = post.facebookVideoThumbnail ?? post.previewImage ?? post.imageUrl;
  if (typeof thumb === 'string' && thumb.trim()) return nestAbsoluteAssetUrl(thumb.trim());
  const imageMedia = post.media?.find((m) => m.type === 'image')?.url;
  if (imageMedia?.trim()) return nestAbsoluteAssetUrl(imageMedia.trim());
  return null;
}

function postVideo(post: ListingPost): string | null {
  const video = post.videoUrl ?? post.media?.find((m) => m.type === 'video')?.url;
  return video?.trim() ? nestAbsoluteAssetUrl(video.trim()) : null;
}

function postHref(post: ListingPost): string {
  return `/prispevky/${encodeURIComponent(String(post.id))}`;
}

function listingHref(p: PropertyFeedItem): string {
  return `/nemovitost/${encodeURIComponent(String(p.id))}`;
}

function mapPropertyPreview(p: PropertyFeedItem, index: number): AuthPortalPreviewItem {
  const isShort = propertyListingHasVideo(p);
  const cover = classicListingCoverUrl(p);
  const video = isShort && p.videoUrl?.trim() ? nestAbsoluteAssetUrl(p.videoUrl.trim()) : null;
  return {
    id: `listing-${p.id}`,
    title: (p.title ?? '').trim() || 'Inzerát',
    subtitle: (p.location ?? p.address ?? 'ČR').toString(),
    kind: isShort ? 'short' : 'listing',
    coverUrl: cover ? nestAbsoluteAssetUrl(cover) : null,
    videoUrl: video,
    href: listingHref(p),
    hasLiveMedia: Boolean(video),
    positionClass: DESKTOP_POSITIONS[index % DESKTOP_POSITIONS.length],
  };
}

function mapPostPreview(post: ListingPost): AuthPortalPreviewItem | null {
  const id = String(post.id ?? '').trim();
  if (!id) return null;
  const isFb = post.source === 'FACEBOOK' || post.isFacebookPagePost;
  const isVideo = isFacebookVideoPost(post) || Boolean(postVideo(post));
  return {
    id: `post-${id}`,
    title: String(post.description ?? '').trim().slice(0, 48) || 'Příspěvek',
    subtitle: isFb ? 'Facebook' : 'Komunita',
    kind: isFb ? 'facebook' : 'post',
    coverUrl: postCover(post),
    videoUrl: postVideo(post),
    href: postHref(post),
    hasLiveMedia: isVideo,
  };
}

function mapStoryPreview(story: {
  id: string;
  type: string;
  mediaUrl: string;
  user?: { name?: string | null };
}): AuthPortalPreviewItem {
  const isVideo = story.type === 'VIDEO';
  const media = nestAbsoluteAssetUrl(story.mediaUrl);
  return {
    id: `story-${story.id}`,
    title: story.user?.name?.trim() || 'Příběh',
    subtitle: 'Příběh',
    kind: 'story',
    coverUrl: media,
    videoUrl: isVideo ? media : null,
    href: '/',
    hasLiveMedia: isVideo,
  };
}

function mapPromoPreview(
  profile: {
    id: string;
    roleLabel: string;
    avatarUrl: string | null;
    profileHref: string;
  },
  index: number,
): AuthPortalPreviewItem {
  const cover = profile.avatarUrl?.trim()
    ? nestAbsoluteAssetUrl(profile.avatarUrl.trim())
    : null;
  return {
    id: `promo-${profile.id}`,
    title: profile.roleLabel,
    subtitle: profile.roleLabel,
    kind: 'promo',
    coverUrl: cover,
    videoUrl: null,
    href: profile.profileHref,
    hasLiveMedia: false,
    positionClass: DESKTOP_POSITIONS[index % DESKTOP_POSITIONS.length],
  };
}

/** Náhodně smíchaný živý náhled portálu pro login/registraci. */
export async function loadAuthPortalPreviewItems(max = 14): Promise<AuthPortalPreviewItem[]> {
  const [propertiesResult, postsResult, storiesResult, promoResult] = await Promise.allSettled([
    API_BASE_URL
      ? loadPropertyFeedItems(API_BASE_URL, { path: '/properties' })
      : Promise.resolve({ items: [] as PropertyFeedItem[] }),
    nestFetchCommunityPosts(),
    nestListPublicStories(),
    nestFetchPublicPromoProfiles(24),
  ]);

  const properties =
    propertiesResult.status === 'fulfilled' ? propertiesResult.value.items : [];
  const posts = postsResult.status === 'fulfilled' ? postsResult.value : [];
  const stories = storiesResult.status === 'fulfilled' ? (storiesResult.value ?? []) : [];
  const promoProfiles =
    promoResult.status === 'fulfilled' ? promoResult.value : [];

  const mapped: AuthPortalPreviewItem[] = [];
  for (const profile of promoProfiles.slice(0, 10)) {
    mapped.push(mapPromoPreview(profile, mapped.length));
  }
  for (const p of properties.slice(0, 8)) {
    mapped.push(mapPropertyPreview(p, mapped.length));
  }
  for (const post of posts.slice(0, 8)) {
    const row = mapPostPreview(post);
    if (row) mapped.push(row);
  }
  for (const story of stories.slice(0, 6)) {
    mapped.push(mapStoryPreview(story));
  }

  const shuffled = shuffle(mapped);
  if (shuffled.length > 0) {
    return shuffled.slice(0, max).map((item, index) => ({
      ...item,
      positionClass: DESKTOP_POSITIONS[index % DESKTOP_POSITIONS.length],
    }));
  }

  return loadAuthDecorCards().then((cards) =>
    cards.map((card, index) => decorCardToPreview(card, index)),
  );
}

function decorCardToPreview(card: AuthDecorCard, index: number): AuthPortalPreviewItem {
  return {
    id: card.key,
    title: card.title,
    subtitle: card.location,
    kind: card.kind === 'short' ? 'short' : 'listing',
    coverUrl: card.coverPath ? nestAbsoluteAssetUrl(card.coverPath) : null,
    videoUrl: null,
    href: '/nemovitosti',
    hasLiveMedia: card.kind === 'short',
    positionClass: card.positionClass || DESKTOP_POSITIONS[index % DESKTOP_POSITIONS.length],
  };
}

export { mapPropertyToDecorCard };
