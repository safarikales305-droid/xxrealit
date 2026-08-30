'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Building2, Globe, Hammer, Home, Landmark, PenTool, Ruler, TrendingUp, Users, HardHat } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL, nestAbsoluteAssetUrl } from '@/lib/api';
import { fetchListingLocations, type ListingLocationOption } from '@/lib/listing-locations';
import { loadPropertyFeedItems } from '@/lib/load-feed';
import {
  nestAddPostComment,
  nestFetchCommunityPosts,
  nestFetchPostComments,
  nestListPublicStories,
  nestFetchShortVideoPublic,
  nestAuthHeaders,
  nestSetPostReaction,
  type ListingPost,
  type NestStoryRow,
  type PostComment,
  type ShortVideo,
} from '@/lib/nest-client';
import { CreateCommunityPostCard } from '@/components/community/CreateCommunityPostCard';
import { PostUploadQueueRunner } from '@/components/community/PostUploadProgress';
import { CommunityPostCard } from '@/components/community/CommunityPostCard';
import {
  buildMetaCentrumPromoteUrlFromPost,
  isPromotablePost,
} from '@/lib/meta-centrum-promote';
import { MobileClassicSwipeFeed } from '@/components/home/MobileClassicSwipeFeed';
import { MobileFiltersSheet } from '@/components/home/MobileFiltersSheet';
import { PropertyGrid } from '@/components/property-grid';
import { classicListingsOnly, tipListingsOnly } from '@/lib/property-feed-filters';
import { parseApiListingPrice, type PropertyFeedItem } from '@/types/property';
import { MixedShortsFeed } from '@/components/video-feed/MixedShortsFeed';
import type { ShortsFeedItem } from '@/lib/shorts-feed';
import {
  isPropertyShortsItem,
  normalizeShortsFeedItem,
  resolveShortDeepLinkParam,
  shortsPayloadToShortVideo,
} from '@/lib/shorts-feed';
import { Navbar, type ViewMode } from './navbar';
import { RightSidebar } from './right-sidebar';
import { SidebarFilters } from './sidebar-filters';
import { PortalProfilesCarousel } from './PortalProfilesCarousel';
import { FeedSkeletonRows } from '@/components/ui/page-loading';
import { NewsHomeBlock } from '@/components/news/NewsHomeBlock';
import type { CommunityCategoryKey } from '@/lib/community-category-roles';
import { sortCommunityPostsByFeedDate } from '@/lib/community-post-feed.util';

function buildListingFilterQuery(
  searchParams: { get: (key: string) => string | null },
  searchQuery: string,
): string {
  const params = new URLSearchParams();
  const cities = searchParams.get('cities')?.trim();
  if (cities) params.set('cities', cities);
  const ptype = searchParams.get('ptype')?.trim();
  if (ptype) params.set('propertyTypeKey', ptype.toLowerCase());
  const priceMin = searchParams.get('priceMin')?.trim();
  if (priceMin) params.set('priceMin', priceMin);
  const priceMax = searchParams.get('priceMax')?.trim();
  if (priceMax) params.set('priceMax', priceMax);
  const tipsOnly = searchParams.get('tipsOnly')?.trim().toLowerCase();
  if (tipsOnly === '1' || tipsOnly === 'true') params.set('tipsOnly', '1');
  const loc = searchQuery.trim();
  if (loc) params.set('location', loc);
  return params.toString();
}

function foldSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function locationHintScore(loc: ListingLocationOption, query: string): number {
  const q = query.trim().toLowerCase();
  const qFold = foldSearch(q);
  if (!q) return 0;
  const parts = [loc.city, loc.district, loc.region, loc.label].map((p) => p.toLowerCase());
  let best = 0;
  for (const part of parts) {
    const fold = foldSearch(part);
    if (part === q || fold === qFold) best = Math.max(best, 100);
    else if (part.startsWith(q) || fold.startsWith(qFold)) best = Math.max(best, 80);
    else if (part.includes(q) || fold.includes(qFold)) best = Math.max(best, 50);
  }
  return best;
}

type Props = {
  items: PropertyFeedItem[];
  classicTotal: number;
  /** Wired from `app/page.tsx` — vertical `/videos/*` shorts feed. */
  ShortsFeed: ComponentType<{ items: PropertyFeedItem[] }>;
  /** Production build without NEXT_PUBLIC_API_URL / API_URL. */
  apiConfigMissing?: boolean;
};

type SidebarCompanyAd = {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  ctaText: string;
  targetUrl: string;
  company?: {
    name?: string;
  };
};

const brandBtn =
  'rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-10 py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-white shadow-[0_8px_28px_-6px_rgba(255,106,0,0.45)] transition duration-300 hover:scale-[1.02] hover:shadow-[0_12px_36px_-6px_rgba(255,80,0,0.5)] active:scale-[0.98]';

const COMMUNITY_CATEGORIES = [
  { key: 'VSE', label: 'Vše', icon: Globe, queryValue: 'all' },
  { key: 'MAKLERI', label: 'Makléři', icon: Briefcase, queryValue: 'agents' },
  { key: 'STAVEBNI_FIRMY', label: 'Stavební firmy', icon: Building2, queryValue: 'companies' },
  { key: 'REALITNI_KANCELARE', label: 'Realitní kanceláře', icon: Home, queryValue: 'agencies' },
  {
    key: 'FINANCNI_PORADCI',
    label: 'Finanční poradci',
    icon: Landmark,
    queryValue: 'financial-advisors',
  },
  { key: 'INVESTORI', label: 'Investoři', icon: TrendingUp, queryValue: 'investors' },
  { key: 'DEVELOPERI', label: 'Developeři', icon: HardHat, queryValue: 'developers' },
  { key: 'PROJEKTANTI', label: 'Projektanti', icon: Ruler, queryValue: 'designers' },
  { key: 'ARCHITEKTI', label: 'Architekti', icon: PenTool, queryValue: 'architects' },
  { key: 'REMESLNIKI', label: 'Řemeslníci', icon: Hammer, queryValue: 'craftsmen' },
  { key: 'DALSI_PROFESIONALOVE', label: 'Další profesionálové', icon: Users, queryValue: 'other-professionals' },
  { key: 'PRACOVNICI_PORTALU', label: 'Pracovníci portálu', icon: Users, queryValue: 'portal-workers' },
] as const;
const RADIUS_OPTIONS_KM = [10, 20, 30, 50, 100] as const;
type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number]['key'];

function parseCategoryFromQuery(raw: string | null): CommunityCategory {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'all':
      return 'VSE';
    case 'companies':
      return 'STAVEBNI_FIRMY';
    case 'agencies':
      return 'REALITNI_KANCELARE';
    case 'financial-advisors':
      return 'FINANCNI_PORADCI';
    case 'investors':
      return 'INVESTORI';
    case 'developers':
      return 'DEVELOPERI';
    case 'designers':
      return 'PROJEKTANTI';
    case 'architects':
      return 'ARCHITEKTI';
    case 'craftsmen':
      return 'REMESLNIKI';
    case 'other-professionals':
      return 'DALSI_PROFESIONALOVE';
    case 'portal-workers':
      return 'PRACOVNICI_PORTALU';
    case 'agents':
      return 'MAKLERI';
    default:
      return 'VSE';
  }
}

function categoryToQueryValue(category: CommunityCategory): string {
  const matched = COMMUNITY_CATEGORIES.find((x) => x.key === category);
  return matched?.queryValue ?? 'all';
}

function feedShortsRowToShortVideo(row: Record<string, unknown>): ShortVideo | null {
  const id = row.id != null ? String(row.id) : '';
  if (!id) return null;
  const rawCreated = row.createdAt;
  const createdAt =
    typeof rawCreated === 'string'
      ? rawCreated
      : rawCreated instanceof Date
        ? rawCreated.toISOString()
        : new Date().toISOString();
  const userIdRaw = row.userId ?? row.ownerId ?? (row.user as { id?: unknown } | undefined)?.id;
  const userId = userIdRaw != null && String(userIdRaw).trim() ? String(userIdRaw).trim() : undefined;

  const pubRaw = row.publishedAt;
  const publishedAt =
    typeof pubRaw === 'string'
      ? pubRaw
      : pubRaw instanceof Date
        ? pubRaw.toISOString()
        : null;
  const viewsRaw = row.viewsCount ?? row.views ?? row.viewCount ?? row.views_count;
  const viewsCount =
    typeof viewsRaw === 'number'
      ? Math.max(0, Math.trunc(viewsRaw))
      : typeof viewsRaw === 'string'
        ? Math.max(0, Math.trunc(Number.parseInt(viewsRaw, 10) || 0))
        : undefined;
  return {
    id,
    videoUrl: typeof row.videoUrl === 'string' ? row.videoUrl : null,
    url: typeof row.url === 'string' ? row.url : undefined,
    title: row.title != null ? String(row.title) : null,
    price: parseApiListingPrice(row.price),
    city: typeof row.city === 'string' ? row.city : null,
    createdAt,
    publishedAt,
    viewsCount,
    userId,
    liked: typeof row.liked === 'boolean' ? row.liked : undefined,
    images: Array.isArray(row.images)
      ? (row.images as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
      : undefined,
    imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null,
    isTiparTip: row.isTiparTip === true || row.isTip === true,
    isTip: row.isTip === true || row.isTiparTip === true,
    listingType: typeof row.listingType === 'string' ? row.listingType : null,
    contactUnlocked: row.contactUnlocked === true,
    sellerContactVisible: row.sellerContactVisible === true,
    buyerInterestSubmitted: row.buyerInterestSubmitted === true,
    contactUnlockPrice:
      typeof row.contactUnlockPrice === 'number' && Number.isFinite(row.contactUnlockPrice)
        ? row.contactUnlockPrice
        : undefined,
    contactUnlockAvailable: row.contactUnlockAvailable !== false,
  };
}

/**
 * Light shell + Shorts (TikTok) / Classic (Sreality-style grid).
 */
export function HomeLayout({
  items,
  classicTotal,
  ShortsFeed: _ShortsFeed,
  apiConfigMissing = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh, user, isAuthenticated, isLoading, apiAccessToken } = useAuth();
  /** Po příchodu na homepage (včetně router.push('/')) znovu načte uživatele z tokenu přes GET /api/auth/me. */
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!API_BASE_URL) return;
    void fetch(`${API_BASE_URL}/analytics/visit`, {
      method: 'POST',
    }).catch(() => {
      /* ignore tracking errors */
    });
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('shorts');
  const [searchQuery, setSearchQuery] = useState('');
  const [listingLocations, setListingLocations] = useState<ListingLocationOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    const q = searchQuery.trim();
    const handle = window.setTimeout(() => {
      void fetchListingLocations(API_BASE_URL, {
        q: q || undefined,
        limit: 500,
      }).then((items) => {
        if (!cancelled) setListingLocations(items);
      });
    }, q ? 220 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [searchQuery]);

  const searchLocationHints = useMemo(() => {
    const s = searchQuery.trim();
    if (!s) return listingLocations.slice(0, 12);
    return [...listingLocations]
      .filter((loc) => locationHintScore(loc, s) > 0)
      .sort((a, b) => {
        const scoreDiff = locationHintScore(b, s) - locationHintScore(a, s);
        if (scoreDiff !== 0) return scoreDiff;
        if (b.count !== a.count) return b.count - a.count;
        return a.label.localeCompare(b.label, 'cs');
      })
      .slice(0, 12);
  }, [listingLocations, searchQuery]);

  const listingFilterQuery = useMemo(
    () => buildListingFilterQuery(searchParams, searchQuery),
    [searchParams, searchQuery],
  );

  const activeLocationLabel = useMemo(() => {
    const cities = searchParams.get('cities')?.trim();
    if (cities) return cities;
    const loc = searchQuery.trim();
    return loc || null;
  }, [searchParams, searchQuery]);

  const sharedVideoId = useMemo(
    () => searchParams.get('video')?.trim() || null,
    [searchParams],
  );
  const sharedShortKey = useMemo(
    () =>
      resolveShortDeepLinkParam(searchParams.get('short'), searchParams.get('video')),
    [searchParams],
  );
  const sharedCollectionId = useMemo(
    () => searchParams.get('collection')?.trim() || null,
    [searchParams],
  );
  const tipsOnlyActive = useMemo(() => {
    const raw = searchParams.get('tipsOnly')?.trim().toLowerCase();
    return raw === '1' || raw === 'true';
  }, [searchParams]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const category = parseCategoryFromQuery(searchParams.get('category'));
    const v = searchParams.get('video')?.trim();
    const short = searchParams.get('short')?.trim();
    if (tab === 'posts') {
      setViewMode('posts');
      setActiveCategory(category);
      return;
    }
    if (tab === 'shorts' || Boolean(v) || Boolean(short)) {
      setViewMode('shorts');
      return;
    }
    if (tab === 'classic') {
      setViewMode('classic');
    }
  }, [searchParams]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [videoFeed, setVideoFeed] = useState<ShortVideo[]>([]);
  const [mixedShortsFeed, setMixedShortsFeed] = useState<ShortsFeedItem[]>([]);
  const [shortsFeedCursor, setShortsFeedCursor] = useState<string | null>(null);
  const [shortsFeedHasMore, setShortsFeedHasMore] = useState(false);
  const [shortsFeedLoadingMore, setShortsFeedLoadingMore] = useState(false);
  const [shortsFeedError, setShortsFeedError] = useState(false);
  const [shortsFeedRetryNonce, setShortsFeedRetryNonce] = useState(0);
  const [shortsTargetIndexInPage, setShortsTargetIndexInPage] = useState<number | null>(null);
  const [shortsTargetMissing, setShortsTargetMissing] = useState(false);
  /** Video z deep linku, které ještě není v odpovědi /feed/shorts. */
  const [shareExtraVideo, setShareExtraVideo] = useState<ShortVideo | null>(null);
  const [shareExtraLoading, setShareExtraLoading] = useState(false);
  /** Když `/feed/shorts` vrátí 0 položek — klasický katalog z GET `/properties`. */
  const [shortsFallbackItems, setShortsFallbackItems] = useState<PropertyFeedItem[]>([]);
  const [shortsTotal, setShortsTotal] = useState<number | null>(null);
  const [postFeed, setPostFeed] = useState<Array<Record<string, unknown>>>([]);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const postsPageRef = useRef(0);
  const postsLoadMoreRef = useRef<HTMLDivElement>(null);
  const POSTS_PAGE_SIZE = 30;
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CommunityCategory>('VSE');
  const [postsCategoryOpen, setPostsCategoryOpen] = useState(false);
  const [radiusKm, setRadiusKm] = useState<(typeof RADIUS_OPTIONS_KM)[number]>(30);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [likedByPostId, setLikedByPostId] = useState<Record<string, boolean>>({});
  const [dislikedByPostId, setDislikedByPostId] = useState<Record<string, boolean>>({});
  const [dislikeCountByPostId, setDislikeCountByPostId] = useState<Record<string, number>>({});
  const [likeCountByPostId, setLikeCountByPostId] = useState<Record<string, number>>({});
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, PostComment[]>>({});
  const [commentInputByPostId, setCommentInputByPostId] = useState<Record<string, string>>({});
  const [commentsOpenByPostId, setCommentsOpenByPostId] = useState<Record<string, boolean>>({});
  const [mutedByPostId, setMutedByPostId] = useState<Record<string, boolean>>({});
  const [stories, setStories] = useState<NestStoryRow[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [sidebarAd, setSidebarAd] = useState<SidebarCompanyAd | null>(null);
  const [sidebarAdImageBroken, setSidebarAdImageBroken] = useState(false);
  const activeCategoryLabel =
    COMMUNITY_CATEGORIES.find((x) => x.key === activeCategory)?.label ?? 'Zobrazit vše';
  const createPostCategory =
    activeCategory === 'VSE' ||
    activeCategory === 'PRACOVNICI_PORTALU' ||
    activeCategory === 'DALSI_PROFESIONALOVE'
      ? 'MAKLERI'
      : activeCategory;

  const storyCards = useMemo(() => stories.slice(0, 20), [stories]);
  const activeStory = storyCards[storyViewerIndex] ?? null;
  const sidebarSeedPropertyId = useMemo(() => {
    for (const p of items) {
      const id = String(p.id ?? '').trim();
      if (id.length > 0) return id;
    }
    return '';
  }, [items]);

  function mergePostReactionMaps(list: ListingPost[], userId?: string) {
    setLikeCountByPostId((prev) => {
      const next = { ...prev };
      for (const p of list) {
        const id = String(p.id ?? '');
        if (!id) continue;
        const likes = Number(
          (p.reactions ?? []).filter((r) => r.type === 'LIKE').length,
        );
        next[id] = Number.isFinite(likes) ? likes : 0;
      }
      return next;
    });
    setDislikeCountByPostId((prev) => {
      const next = { ...prev };
      for (const p of list) {
        const id = String(p.id ?? '');
        if (!id) continue;
        const dislikes = Number(
          (p.reactions ?? []).filter((r) => r.type === 'DISLIKE').length,
        );
        next[id] = Number.isFinite(dislikes) ? dislikes : 0;
      }
      return next;
    });
    if (userId) {
      setLikedByPostId((prev) => {
        const next = { ...prev };
        for (const p of list) {
          const id = String(p.id ?? '');
          if (!id) continue;
          const mine = (p.reactions ?? []).find((r) => String(r.userId ?? '') === userId);
          next[id] = mine?.type === 'LIKE';
        }
        return next;
      });
      setDislikedByPostId((prev) => {
        const next = { ...prev };
        for (const p of list) {
          const id = String(p.id ?? '');
          if (!id) continue;
          const mine = (p.reactions ?? []).find((r) => String(r.userId ?? '') === userId);
          next[id] = mine?.type === 'DISLIKE';
        }
        return next;
      });
    }
  }

  const refreshPostsFeed = useCallback(async () => {
    if (!API_BASE_URL) return;
    postsPageRef.current = 0;
    const result = await nestFetchCommunityPosts(
      activeCategory,
      {
        radiusKm,
        lat: userCoords?.lat,
        lng: userCoords?.lng,
        page: 0,
        limit: POSTS_PAGE_SIZE,
      },
      apiAccessToken,
    );
    setPostFeed(
      sortCommunityPostsByFeedDate(result.items as ListingPost[]) as Array<Record<string, unknown>>,
    );
    setPostsHasMore(result.hasMore);
    mergePostReactionMaps(result.items, user?.id);
  }, [
    activeCategory,
    radiusKm,
    userCoords?.lat,
    userCoords?.lng,
    apiAccessToken,
    user?.id,
  ]);

  async function loadMorePosts() {
    if (!API_BASE_URL || postsLoadingMore || !postsHasMore) return;
    const nextPage = postsPageRef.current + 1;
    setPostsLoadingMore(true);
    try {
      const result = await nestFetchCommunityPosts(
        activeCategory,
        {
          radiusKm,
          lat: userCoords?.lat,
          lng: userCoords?.lng,
          page: nextPage,
          limit: POSTS_PAGE_SIZE,
        },
        apiAccessToken,
      );
      postsPageRef.current = nextPage;
      setPostsHasMore(result.hasMore);
      setPostFeed((prev) =>
        sortCommunityPostsByFeedDate([
          ...(prev as ListingPost[]),
          ...(result.items as ListingPost[]),
        ]) as Array<Record<string, unknown>>,
      );
      mergePostReactionMaps(result.items, user?.id);
    } finally {
      setPostsLoadingMore(false);
    }
  }

  useEffect(() => {
    const onPostsRefresh = () => {
      void refreshPostsFeed();
    };
    window.addEventListener('xxrealit:posts-refresh', onPostsRefresh);
    return () => window.removeEventListener('xxrealit:posts-refresh', onPostsRefresh);
  }, [refreshPostsFeed]);

  async function deletePost(postId: string) {
    if (!API_BASE_URL || !apiAccessToken) return;
    const postsBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
    const res = await fetch(`${postsBase}/posts/${postId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiAccessToken}`,
      },
    });
    if (!res.ok) return;
    setPostFeed((prev) => prev.filter((p) => String(p.id ?? '') !== postId));
  }

  async function savePostEdit(postId: string) {
    if (!API_BASE_URL || !apiAccessToken) return;
    const postsBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
    const text = editingText.trim();
    if (!text) return;
    const res = await fetch(`${postsBase}/posts/${postId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiAccessToken}`,
      },
      body: JSON.stringify({ description: text, content: text }),
    });
    if (!res.ok) return;
    setEditingPostId(null);
    setEditingText('');
    await refreshPostsFeed();
  }

  async function toggleReaction(postId: string, type: 'LIKE' | 'DISLIKE') {
    if (!apiAccessToken) return;
    const res = await nestSetPostReaction(apiAccessToken, postId, type);
    if (!res.ok) return;
    setLikedByPostId((prev) => ({ ...prev, [postId]: res.reaction === 'LIKE' }));
    setDislikedByPostId((prev) => ({ ...prev, [postId]: res.reaction === 'DISLIKE' }));
    setLikeCountByPostId((prev) => ({ ...prev, [postId]: res.likeCount }));
    setDislikeCountByPostId((prev) => ({ ...prev, [postId]: res.dislikeCount }));
  }

  async function loadComments(postId: string) {
    const comments = await nestFetchPostComments(postId);
    setCommentsByPostId((prev) => ({ ...prev, [postId]: comments }));
  }

  async function sendComment(postId: string) {
    if (!apiAccessToken) return;
    const text = (commentInputByPostId[postId] ?? '').trim();
    if (!text) return;
    const res = await nestAddPostComment(apiAccessToken, postId, text);
    if (!res.ok) return;
    setCommentInputByPostId((prev) => ({ ...prev, [postId]: '' }));
    await loadComments(postId);
  }

  const classicGridItems = useMemo(() => classicListingsOnly(items), [items]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('CLASSIC LISTINGS RESPONSE', {
      total: classicTotal,
      grid: classicGridItems.length,
      sample: classicGridItems[0]?.id ?? null,
    });
    // eslint-disable-next-line no-console
    console.log('CLASSIC LISTINGS NORMALIZED', classicGridItems);
  }, [classicGridItems, classicTotal]);

  const filteredItems = useMemo(() => {
    let list = classicGridItems;
    if (tipsOnlyActive) list = tipListingsOnly(list);
    const s = searchQuery.trim().toLowerCase();
    if (!s) return list;
    const matchedCities = new Set(
      listingLocations
        .filter((loc) => {
          const blob = `${loc.city} ${loc.district} ${loc.region}`.toLowerCase();
          return blob.includes(s);
        })
        .map((loc) => loc.city.toLowerCase()),
    );
    return list.filter((p) => {
      const title = p.title.toLowerCase();
      const location = p.location.toLowerCase();
      if (title.includes(s) || location.includes(s)) return true;
      if (matchedCities.size > 0) {
        return matchedCities.has(location) || [...matchedCities].some((c) => location.includes(c));
      }
      return false;
    });
  }, [classicGridItems, searchQuery, tipsOnlyActive, listingLocations]);

  const classicShortsFallbackGrid = useMemo(
    () => classicListingsOnly(shortsFallbackItems),
    [shortsFallbackItems],
  );

  const filteredShortsFallback = useMemo(() => {
    let list = classicShortsFallbackGrid;
    if (tipsOnlyActive) list = tipListingsOnly(list);
    const s = searchQuery.trim().toLowerCase();
    if (!s) return list;
    const matchedCities = new Set(
      listingLocations
        .filter((loc) => {
          const blob = `${loc.city} ${loc.district} ${loc.region}`.toLowerCase();
          return blob.includes(s);
        })
        .map((loc) => loc.city.toLowerCase()),
    );
    return list.filter((p) => {
      const title = p.title.toLowerCase();
      const location = p.location.toLowerCase();
      if (title.includes(s) || location.includes(s)) return true;
      if (matchedCities.size > 0) {
        return matchedCities.has(location) || [...matchedCities].some((c) => location.includes(c));
      }
      return false;
    });
  }, [classicShortsFallbackGrid, searchQuery, tipsOnlyActive, listingLocations]);

  const mixedItemsForFeed = useMemo(() => {
    const seen = new Set<string>();
    const merged: ShortsFeedItem[] = [];
    if (shareExtraVideo) {
      merged.push({
        feedKey: `property:${shareExtraVideo.id}`,
        contentType: 'property',
        publishedAt: shareExtraVideo.publishedAt ?? shareExtraVideo.createdAt,
        payload: { ...shareExtraVideo } as Record<string, unknown>,
      });
      seen.add(shareExtraVideo.id);
    }
    for (const item of mixedShortsFeed) {
      if (!seen.has(item.feedKey)) {
        merged.push(item);
        seen.add(item.feedKey);
      }
    }
    const filtered = tipsOnlyActive
      ? merged.filter((item) => {
          if (!isPropertyShortsItem(item)) return false;
          return item.payload.isTip === true || item.payload.isTiparTip === true;
        })
      : merged;
    if (!sharedShortKey || shortsTargetIndexInPage != null) {
      return filtered;
    }
    const idx = merged.findIndex(
      (item) =>
        item.feedKey === sharedShortKey ||
        (sharedShortKey.startsWith('property:') &&
          (item.feedKey === sharedShortKey ||
            item.feedKey === sharedShortKey.replace('property:', 'property-video:'))),
    );
    if (idx === -1) return merged;
    const picked = merged[idx];
    const rest = merged.filter((_, i) => i !== idx);
    return [picked, ...rest];
  }, [mixedShortsFeed, shareExtraVideo, sharedShortKey, tipsOnlyActive, shortsTargetIndexInPage]);

  const handleActiveShortChange = useCallback(
    (feedKey: string) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      if (url.searchParams.get('short') === feedKey && url.searchParams.get('tab') === 'shorts') {
        return;
      }
      url.searchParams.set('tab', 'shorts');
      url.searchParams.set('short', feedKey);
      url.searchParams.delete('video');
      window.history.replaceState(window.history.state, '', url.toString());
    },
    [],
  );

  /** Feed zobrazíme hned po načtení shorts; sdílené video / profily jdou na pozadí. */
  const shortsBootstrapBusy =
    loadingFeed && mixedItemsForFeed.length === 0 && filteredShortsFallback.length === 0;

  const hasData = classicGridItems.length > 0;
  const listingsTotalLabel = useMemo(() => {
    const raw =
      viewMode === 'classic'
        ? classicTotal
        : viewMode === 'shorts'
          ? shortsTotal
          : null;
    if (raw == null || !Number.isFinite(raw)) return 'Načítání...';
    const n = Math.max(0, Math.trunc(raw));
    const num = new Intl.NumberFormat('cs-CZ').format(n);
    return `Celkem ${num} inzerátů`;
  }, [viewMode, classicTotal, shortsTotal]);
  const showNoSearchHits =
    viewMode === 'classic' && hasData && filteredItems.length === 0;
  const showNoSearchHitsShorts =
    viewMode === 'shorts' &&
    !shortsBootstrapBusy &&
    mixedItemsForFeed.length === 0 &&
    (activeLocationLabel != null || listingFilterQuery.length > 0);

  const showNoSearchHitsShortsFallback =
    viewMode === 'shorts' &&
    !shortsBootstrapBusy &&
    mixedItemsForFeed.length === 0 &&
    classicShortsFallbackGrid.length > 0 &&
    filteredShortsFallback.length === 0 &&
    !showNoSearchHitsShorts;

  const communityFeedPosts = useMemo(
    () =>
      sortCommunityPostsByFeedDate(
        postFeed.filter((row) => {
          const t = String((row as ListingPost).type ?? '');
          return t !== 'short';
        }) as ListingPost[],
      ),
    [postFeed],
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGeoDenied(false);
      },
      () => {
        setGeoDenied(true);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
    );
  }, []);

  useEffect(() => {
    if (!API_BASE_URL || viewMode !== 'shorts') return;
    let cancelled = false;
    setLoadingFeed(true);
    setShortsFeedError(false);
    setMixedShortsFeed([]);
    setShortsFeedCursor(null);
    setShortsFeedHasMore(false);
    setShortsTargetIndexInPage(null);
    setShortsTargetMissing(false);

    void (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const qs = listingFilterQuery;
        const params = new URLSearchParams(qs);
        params.set('limit', '20');
        if (sharedCollectionId) params.set('collection', sharedCollectionId);
        else if (sharedShortKey) params.set('target', sharedShortKey);
        const shortsUrl = `${API_BASE_URL}/feed/shorts/feed?${params.toString()}`;
        const res = await fetch(shortsUrl, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            ...(apiAccessToken ? nestAuthHeaders(apiAccessToken) : {}),
          },
        });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn(
            `[HomeLayout] GET mixed shorts feed failed: ${res.status} ${res.statusText} — ${shortsUrl}`,
          );
          if (!cancelled) {
            setShortsFeedError(true);
            setMixedShortsFeed([]);
            setVideoFeed([]);
            setShortsTotal(0);
            setShortsFallbackItems([]);
          }
          return;
        }
        const data = (await res.json()) as {
          items?: ShortsFeedItem[];
          nextCursor?: string | null;
          hasMore?: boolean;
          targetIndexInPage?: number | null;
          targetFound?: boolean;
        };
        const list = (Array.isArray(data.items) ? data.items : []).map(normalizeShortsFeedItem);
        const propertyCount = list.filter((x) => isPropertyShortsItem(x)).length;
        if (cancelled) return;
        setMixedShortsFeed(list);
        setShortsFeedCursor(data.nextCursor ?? null);
        setShortsFeedHasMore(Boolean(data.hasMore));
        setShortsTargetIndexInPage(
          typeof data.targetIndexInPage === 'number' ? data.targetIndexInPage : null,
        );
        setShortsTargetMissing(Boolean(sharedShortKey && data.targetFound === false));
        setShortsTotal(propertyCount > 0 ? propertyCount : list.length);
        setVideoFeed(
          list
            .filter(isPropertyShortsItem)
            .map((x) => shortsPayloadToShortVideo(x.payload))
            .filter((x): x is ShortVideo => x != null),
        );
        if (list.length === 0) {
          const classic = await loadPropertyFeedItems(API_BASE_URL, {
            path: '/properties',
            query: qs || undefined,
          });
          if (!cancelled) setShortsFallbackItems(classic.items);
        } else if (!cancelled) {
          setShortsFallbackItems([]);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[HomeLayout] mixed shorts feed load failed', err);
        }
        if (!cancelled) {
          setShortsFeedError(true);
          setMixedShortsFeed([]);
          setVideoFeed([]);
          setShortsTotal(0);
          setShortsFallbackItems([]);
        }
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoadingFeed(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, apiAccessToken, listingFilterQuery, shortsFeedRetryNonce, sharedShortKey, sharedCollectionId]);

  const loadMoreMixedShorts = useCallback(async () => {
    if (!API_BASE_URL || !shortsFeedHasMore || shortsFeedLoadingMore || !shortsFeedCursor) return;
    setShortsFeedLoadingMore(true);
    try {
      const params = new URLSearchParams(listingFilterQuery);
      params.set('limit', '15');
      params.set('cursor', shortsFeedCursor);
      const res = await fetch(`${API_BASE_URL}/feed/shorts/feed?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(apiAccessToken ? nestAuthHeaders(apiAccessToken) : {}),
        },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        items?: ShortsFeedItem[];
        nextCursor?: string | null;
        hasMore?: boolean;
      };
      const list = (Array.isArray(data.items) ? data.items : []).map(normalizeShortsFeedItem);
      setMixedShortsFeed((prev) => {
        const seen = new Set(prev.map((x) => x.feedKey));
        const next = [...prev];
        for (const item of list) {
          if (!seen.has(item.feedKey)) {
            next.push(item);
            seen.add(item.feedKey);
          }
        }
        return next;
      });
      setShortsFeedCursor(data.nextCursor ?? null);
      setShortsFeedHasMore(Boolean(data.hasMore));
    } finally {
      setShortsFeedLoadingMore(false);
    }
  }, [
    apiAccessToken,
    listingFilterQuery,
    shortsFeedCursor,
    shortsFeedHasMore,
    shortsFeedLoadingMore,
  ]);

  useEffect(() => {
    if (viewMode !== 'posts') return;
    let cancelled = false;
    setLoadingFeed(true);
    postsPageRef.current = 0;
    void (async () => {
      try {
        const result = await nestFetchCommunityPosts(
          activeCategory,
          {
            radiusKm,
            lat: userCoords?.lat,
            lng: userCoords?.lng,
            page: 0,
            limit: POSTS_PAGE_SIZE,
          },
          apiAccessToken,
        );
        if (cancelled) return;
        setPostFeed(
          sortCommunityPostsByFeedDate(result.items as ListingPost[]) as Array<Record<string, unknown>>,
        );
        setPostsHasMore(result.hasMore);
        mergePostReactionMaps(result.items, user?.id);
        // eslint-disable-next-line no-console
        console.debug('[posts] feed loaded', {
          category: activeCategory,
          profilesCategory: activeCategory,
          postsCount: result.items.length,
        });
      } catch {
        if (!cancelled) {
          setPostFeed([]);
          setPostsHasMore(false);
        }
      } finally {
        if (!cancelled) setLoadingFeed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, activeCategory, radiusKm, userCoords?.lat, userCoords?.lng, user?.id, apiAccessToken]);

  useEffect(() => {
    if (viewMode !== 'posts' || !postsHasMore) return;
    const el = postsLoadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMorePosts();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, postsHasMore, postsLoadingMore, activeCategory, radiusKm, userCoords?.lat, userCoords?.lng, apiAccessToken]);

  useEffect(() => {
    if (!sharedVideoId) {
      setShareExtraVideo(null);
      setShareExtraLoading(false);
      return;
    }
    if (videoFeed.some((v) => v.id === sharedVideoId)) {
      setShareExtraVideo(null);
      setShareExtraLoading(false);
      return;
    }
    if (!API_BASE_URL) {
      setShareExtraVideo(null);
      setShareExtraLoading(false);
      return;
    }
    setShareExtraLoading(true);
    let cancelled = false;
    void nestFetchShortVideoPublic(sharedVideoId)
      .then((v) => {
        if (cancelled) return;
        setShareExtraVideo(v?.id === sharedVideoId ? v : null);
      })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[HomeLayout] shared short video load failed', sharedVideoId, err);
        }
        if (!cancelled) setShareExtraVideo(null);
      })
      .finally(() => {
        if (!cancelled) setShareExtraLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sharedVideoId, videoFeed]);

  useEffect(() => {
    let cancelled = false;
    setStoriesLoading(true);
    void nestListPublicStories()
      .then((rows) => {
        if (cancelled) return;
        setStories(Array.isArray(rows) ? rows : []);
      })
      .finally(() => {
        if (!cancelled) setStoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (viewMode !== 'posts') {
      setPostsCategoryOpen(false);
    }
  }, [viewMode, activeCategory]);

  useEffect(() => {
    if (!API_BASE_URL || !sidebarSeedPropertyId) {
      setSidebarAd(null);
      setSidebarAdImageBroken(false);
      return;
    }
    let cancelled = false;
    void fetch(`${API_BASE_URL}/company-ads/for-property/${encodeURIComponent(sidebarSeedPropertyId)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json().catch(() => null)) as SidebarCompanyAd | null;
        if (cancelled) return;
        setSidebarAd(data);
        setSidebarAdImageBroken(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSidebarAd(null);
          setSidebarAdImageBroken(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sidebarSeedPropertyId]);

  function updateUrlParams(next: { tab?: 'shorts' | 'classic' | 'posts'; category?: CommunityCategory }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.tab) {
      params.set('tab', next.tab);
    }
    if (next.tab !== 'posts') {
      params.delete('category');
    } else {
      const cat = next.category ?? activeCategory;
      params.set('category', categoryToQueryValue(cat));
    }
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  }

  function onChangeViewMode(mode: ViewMode) {
    setViewMode(mode);
    if (mode === 'posts') {
      updateUrlParams({ tab: 'posts', category: activeCategory });
      return;
    }
    updateUrlParams({ tab: mode });
  }

  function onSelectPostsCategory(category: CommunityCategory) {
    setActiveCategory(category);
    setPostsCategoryOpen(false);
    setViewMode('posts');
    updateUrlParams({ tab: 'posts', category });
  }

  function renderDesktopSidebarAd() {
    if (!sidebarAd) return null;
    return (
      <a
        href={sidebarAd.targetUrl}
        target="_blank"
        rel="noreferrer"
        className="relative z-0 mx-auto block w-full max-w-[260px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_2px_14px_-6px_rgba(0,0,0,0.12)] transition hover:border-zinc-300"
        aria-label={sidebarAd.title}
      >
        {sidebarAdImageBroken ? (
          <div className="flex aspect-[16/10] w-full items-center justify-center bg-zinc-100 px-4 text-center text-xs text-zinc-500">
            Obrázek reklamy se nepodařilo načíst
          </div>
        ) : (
          <img
            src={nestAbsoluteAssetUrl(sidebarAd.imageUrl)}
            alt={sidebarAd.title}
            className="aspect-[16/10] w-full object-cover"
            loading="lazy"
            onError={() => setSidebarAdImageBroken(true)}
          />
        )}
        <div className="space-y-1 p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-zinc-500">
            {sidebarAd.company?.name ?? 'Stavební firma'}
          </p>
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-tight text-zinc-900">{sidebarAd.title}</h3>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-600">{sidebarAd.description}</p>
          <span className="inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-2.5 py-1 text-[11px] font-semibold text-white">
            {sidebarAd.ctaText}
          </span>
        </div>
      </a>
    );
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] flex-col overflow-x-hidden overflow-y-hidden bg-[#fafafa] text-zinc-900 md:h-screen md:max-h-screen">
      <PostUploadQueueRunner />
      {apiConfigMissing ? (
        <div
          role="alert"
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
        >
          Chybí <code className="rounded bg-amber-100/80 px-1">NEXT_PUBLIC_API_URL</code> (a
          volitelně <code className="rounded bg-amber-100/80 px-1">API_URL</code>) — nastav je v
          Railway u frontend služby.
        </div>
      ) : null}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        locationHints={searchLocationHints}
        onLocationHintSelect={(label) => setSearchQuery(label)}
        viewMode={viewMode}
        onViewModeChange={onChangeViewMode}
        onMobileFiltersOpen={
          viewMode === 'classic' ? () => setMobileFiltersOpen(true) : undefined
        }
        activePostsCategoryLabel={viewMode === 'posts' ? activeCategoryLabel : undefined}
      />

      <MobileFiltersSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
      />

      <div
        className={
          viewMode === 'posts'
            ? 'grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 overflow-x-hidden p-0'
            : viewMode === 'shorts'
              ? 'grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 overflow-x-hidden p-0 md:mx-auto md:max-w-[100rem] md:gap-4 md:p-4 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(560px,1fr)_272px]'
              : 'grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 overflow-x-hidden p-0 md:mx-auto md:max-w-[100rem] md:gap-4 md:p-4 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_272px]'
        }
      >
        <div className={`hidden min-h-0 min-w-0 shrink-0 overflow-x-hidden md:block ${viewMode === 'posts' ? 'md:hidden' : ''}`}>
          {viewMode === 'classic' || viewMode === 'shorts' ? (
            <div className="mt-2 hidden rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm lg:block">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Počet inzerátů
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{listingsTotalLabel}</p>
            </div>
          ) : null}
          <SidebarFilters className="mt-0 w-full max-w-full flex-col md:mt-2 md:mb-2 lg:mt-4 lg:mb-4" />
          <NewsHomeBlock limit={4} compact className="mt-3 hidden md:block" />
        </div>

        <main
          className={
            !hasData && viewMode === 'classic'
              ? 'relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)] md:min-w-0'
              : viewMode === 'shorts' && !shortsBootstrapBusy && mixedItemsForFeed.length === 0
                ? 'relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden rounded-2xl border border-zinc-200/90 bg-[#fafafa] shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)] md:min-w-0'
                : viewMode === 'shorts'
                  ? 'relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden bg-black shadow-none max-md:rounded-none md:min-w-0 md:rounded-2xl md:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)] lg:bg-white lg:shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)] lg:ring-1 lg:ring-zinc-200/80'
                  : 'relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden bg-white md:min-w-0 md:rounded-2xl md:border md:border-zinc-200/90 md:shadow-[0_2px_24px_-8px_rgba(0,0,0,0.06)]'
          }
        >
          {!hasData && viewMode === 'classic' ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-8 py-16 text-center">
              <p className="text-3xl font-bold tracking-tight text-zinc-900">
                XXREALIT
              </p>
              <p className="text-lg font-medium text-zinc-700">
                Realitní platforma nové generace
              </p>
              <p className="max-w-md text-[15px] leading-relaxed text-zinc-600">
                {apiConfigMissing
                  ? 'Backend API není nakonfigurované — zkontroluj proměnné prostředí.'
                  : 'Zatím tu nic není. Přidej první video inzerát nebo spusť seed na API.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onChangeViewMode('shorts')}
                  className={brandBtn}
                >
                  Zobrazit nemovitosti
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isAuthenticated) {
                      router.push(
                        `/prihlaseni?redirect=${encodeURIComponent('/inzerat/pridat')}`,
                      );
                      return;
                    }
                    router.push('/inzerat/pridat');
                  }}
                  className="rounded-full border border-zinc-300 bg-white px-8 py-3 text-[15px] font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  Vytvořit inzerát
                </button>
              </div>
            </div>
          ) : showNoSearchHits || showNoSearchHitsShortsFallback || showNoSearchHitsShorts ? (
            <div className="flex min-h-[min(24rem,50vh)] flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <p className="text-lg font-semibold text-zinc-800">
                {showNoSearchHitsShorts
                  ? 'Ve vybrané lokalitě nebyly nalezeny žádné inzeráty.'
                  : `Žádné výsledky pro „${searchQuery.trim() || activeLocationLabel}“`}
              </p>
              <p className="max-w-sm text-sm text-zinc-500">
                Zkuste jinou lokalitu nebo upravte filtry v postranním panelu.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 text-sm font-semibold text-[#e85d00] hover:underline"
              >
                Vymazat hledání
              </button>
            </div>
          ) : (
            <div
              key={viewMode}
              className={
                viewMode === 'shorts'
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden [animation:view-fade-in_0.35s_ease-out]'
                  : 'flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain [animation:view-fade-in_0.35s_ease-out]'
              }
            >
              {viewMode === 'shorts' ? (
                shortsBootstrapBusy ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-white/80 lg:text-zinc-600">
                    <p>
                      {shareExtraLoading && !loadingFeed
                        ? 'Načítám sdílené video…'
                        : 'Načítám video feed…'}
                    </p>
                  </div>
                ) : shortsFeedError ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                    <p className="text-sm font-medium text-white/90 lg:text-zinc-800">
                      Data se nyní nepodařilo načíst.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShortsFeedRetryNonce((n) => n + 1)}
                      className="rounded-full border border-zinc-300 bg-white px-6 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 lg:border-orange-200 lg:text-orange-900"
                    >
                      Zkusit znovu
                    </button>
                  </div>
                ) : mixedItemsForFeed.length > 0 ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {activeLocationLabel ? (
                      <p className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2 text-center text-sm text-zinc-700">
                        Aktivní lokalita: <span className="font-semibold">{activeLocationLabel}</span>
                      </p>
                    ) : null}
                    {shortsTargetMissing ? (
                      <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
                        Toto video již není dostupné — zobrazujeme nejbližší Shorts.
                      </p>
                    ) : null}
                    <MixedShortsFeed
                      key={sharedCollectionId ?? sharedShortKey ?? 'mixed-feed'}
                      items={mixedItemsForFeed}
                      initialFeedKey={sharedShortKey}
                      initialIndex={shortsTargetIndexInPage}
                      onActiveItemChange={(feedKey) => handleActiveShortChange(feedKey)}
                      onMobileFiltersOpen={() => setMobileFiltersOpen(true)}
                      onLoadMore={shortsFeedHasMore ? loadMoreMixedShorts : undefined}
                      loadingMore={shortsFeedLoadingMore}
                    />
                  </div>
                ) : filteredShortsFallback.length > 0 ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain">
                    <p className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2.5 text-center text-[13px] text-zinc-600">
                      Žádné video inzeráty — zobrazujeme klasický katalog (GET /properties).
                    </p>
                    <div className="mx-auto w-full max-w-xl px-3 pb-8 pt-4">
                      <PropertyGrid properties={filteredShortsFallback} />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-4 px-6 text-center text-zinc-600">
                    <p className="max-w-sm text-sm">
                      Žádné video inzeráty ani položky v klasickém katalogu. Spusť seed na API nebo
                      přidej inzerát.
                    </p>
                    <button
                      type="button"
                        onClick={() => onChangeViewMode('classic')}
                      className="rounded-full border border-zinc-300 bg-white px-6 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
                    >
                      Přepnout na klasické zobrazení
                    </button>
                  </div>
                )
              ) : viewMode === 'posts' ? (
                <div className="w-full min-w-0 overflow-x-hidden pb-8 pt-1 max-md:pt-0 md:pt-3">
                  <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-0 py-1 max-md:py-0 md:py-3 sm:px-4 md:px-6">
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                      <aside className="hidden min-w-0 xl:col-span-3 xl:block">
                        <div className="space-y-4 lg:sticky lg:top-20">
                          <div className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold text-zinc-800">Kategorie</p>
                            <ul className="mt-3 space-y-1">
                              {COMMUNITY_CATEGORIES.map((cat) => {
                                const Icon = cat.icon;
                                const active = activeCategory === cat.key;
                                return (
                                  <li key={cat.key}>
                                    <button
                                      type="button"
                                      onClick={() => onSelectPostsCategory(cat.key)}
                                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                                        active
                                          ? 'bg-orange-500 text-white'
                                          : 'text-zinc-700 hover:bg-zinc-100'
                                      }`}
                                    >
                                      <Icon size={16} />
                                      {cat.label}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
                      </aside>

                      <main className="min-w-0 xl:col-span-6">
                        <div className="mx-auto w-full max-w-[650px]">
                        <PortalProfilesCarousel category={activeCategory as CommunityCategoryKey} />
                        <div className="sticky top-0 z-20 w-full rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur max-md:rounded-xl max-md:p-1 md:p-3">
                          <div className="flex w-full min-w-0 items-center justify-between gap-1.5 md:gap-3">
                            <div className="relative min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => setPostsCategoryOpen((v) => !v)}
                                className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-900 transition hover:bg-orange-100 md:px-4 md:py-2"
                              >
                                <span className="md:hidden">Příspěvky</span>
                                <span className="hidden md:inline">Příspěvky / {activeCategoryLabel}</span>
                                <span aria-hidden>{postsCategoryOpen ? '▴' : '▾'}</span>
                              </button>
                              <p className="mt-0.5 text-[11px] font-medium text-zinc-600 md:hidden">
                                Aktivní: {activeCategoryLabel}
                              </p>
                              {postsCategoryOpen ? (
                                <div className="absolute left-0 top-12 z-30 w-[min(92vw,22rem)] rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">
                                  <ul className="space-y-1">
                                    {COMMUNITY_CATEGORIES.map((cat) => {
                                      const Icon = cat.icon;
                                      const active = activeCategory === cat.key;
                                      return (
                                        <li key={cat.key}>
                                          <button
                                            type="button"
                                            onClick={() => onSelectPostsCategory(cat.key)}
                                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                                              active
                                                ? 'bg-orange-500 text-white'
                                                : 'text-zinc-700 hover:bg-zinc-100'
                                            }`}
                                          >
                                            <Icon size={16} />
                                            {cat.label}
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
                              <div className="rounded-2xl border border-slate-200 bg-white px-1.5 py-0.5 shadow-sm md:px-2 md:py-1">
                                <select
                                  value={radiusKm}
                                  onChange={(e) =>
                                    setRadiusKm(
                                      Number(e.target.value) as (typeof RADIUS_OPTIONS_KM)[number],
                                    )
                                  }
                                  className="h-7 rounded-xl bg-transparent px-1.5 text-xs font-medium text-zinc-700 outline-none md:h-8 md:px-2 md:text-sm"
                                >
                                  {RADIUS_OPTIONS_KM.map((radius) => (
                                    <option key={radius} value={radius}>
                                      {radius} km
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <p className="hidden text-xs text-zinc-500 md:block">
                                {userCoords
                                  ? `V okruhu ${radiusKm} km od vás`
                                  : geoDenied
                                    ? 'Poloha není povolena'
                                    : 'Získávám polohu...'}
                              </p>
                            </div>
                          </div>
                          <p className="mt-2 hidden text-sm font-semibold text-zinc-700 md:block">
                            Aktivní kategorie: {activeCategoryLabel}
                          </p>
                        </div>

                        <div className="mt-2 w-full md:mt-4">
                          <CreateCommunityPostCard
                              apiAccessToken={apiAccessToken}
                              activeCategory={createPostCategory}
                              latitude={userCoords?.lat}
                              longitude={userCoords?.lng}
                              showReviewForGuests={!isAuthenticated}
                              defaultAuthorEmail={user?.email ?? undefined}
                              defaultAuthorName={user?.name ?? undefined}
                              onPublished={async () => {
                                onChangeViewMode('posts');
                                await refreshPostsFeed();
                              }}
                            />
                          </div>

                        {storiesLoading || storyCards.length > 0 ? (
                          <div className="mt-4 w-full">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Příběhy
                      </p>
                      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                        {storiesLoading
                          ? Array.from({ length: 6 }).map((_, idx) => (
                              <div key={`story-skel-${idx}`} className="h-[120px] min-w-[70px] rounded-xl bg-zinc-100" />
                            ))
                          : storyCards.map((s, idx) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setStoryViewerIndex(idx);
                                  setStoryViewerOpen(true);
                                }}
                                className="flex h-[120px] min-w-[70px] shrink-0 overflow-hidden rounded-xl ring-2 ring-orange-500/25 ring-offset-2 transition hover:ring-orange-500/60"
                              >
                                {s.type === 'VIDEO' ? (
                                  <video
                                    muted
                                    playsInline
                                    preload="metadata"
                                    className="pointer-events-none h-full w-full object-cover"
                                    src={nestAbsoluteAssetUrl(s.mediaUrl)}
                                  />
                                ) : (
                                  <img
                                    src={nestAbsoluteAssetUrl(s.mediaUrl)}
                                    alt={s.user.name ?? 'Příběh'}
                                    className="pointer-events-none h-full w-full object-cover"
                                  />
                                )}
                              </button>
                            ))}
                      </div>
                          </div>
                        ) : null}

                        <div className="mt-4 flex w-full min-w-0 flex-col gap-0 md:gap-4">
                    {loadingFeed ? (
                      <FeedSkeletonRows count={3} />
                    ) : communityFeedPosts.length === 0 ? (
                      <p className="text-sm text-zinc-600">
                        V této kategorii zatím nejsou žádné příspěvky.
                      </p>
                    ) : (
                      communityFeedPosts.map((row) => {
                        const p = row as ListingPost;
                        const pid = String(p.id ?? '');
                        const defaultMuted = mutedByPostId[pid] ?? true;
                        return (
                          <CommunityPostCard
                            key={pid || Math.random().toString(36)}
                            post={p}
                            currentUserId={user?.id}
                            isAuthenticated={isAuthenticated}
                            guestPreview={!isAuthenticated}
                            liked={Boolean(likedByPostId[pid])}
                            disliked={Boolean(dislikedByPostId[pid])}
                            likeCount={
                              likeCountByPostId[pid] ??
                              Number((p as { likeCount?: number }).likeCount) ??
                              Number((p.reactions ?? []).filter((r) => r.type === 'LIKE').length)
                            }
                            dislikeCount={dislikeCountByPostId[pid] ?? 0}
                            muted={defaultMuted}
                            editingPostId={editingPostId}
                            editingText={editingText}
                            commentsOpen={Boolean(commentsOpenByPostId[pid])}
                            comments={commentsByPostId[pid] ?? []}
                            commentInput={commentInputByPostId[pid] ?? ''}
                            onToggleReaction={(type) => void toggleReaction(pid, type)}
                            onToggleComments={() => {
                              const nextOpen = !Boolean(commentsOpenByPostId[pid]);
                              setCommentsOpenByPostId((prev) => ({
                                ...prev,
                                [pid]: nextOpen,
                              }));
                              if (nextOpen) void loadComments(pid);
                            }}
                            onCommentInput={(v) =>
                              setCommentInputByPostId((prev) => ({ ...prev, [pid]: v }))
                            }
                            onSendComment={() => void sendComment(pid)}
                            onStartEdit={() => {
                              setEditingPostId(pid);
                              setEditingText(String(p.description ?? ''));
                            }}
                            onCancelEdit={() => {
                              setEditingPostId(null);
                              setEditingText('');
                            }}
                            onSaveEdit={() => void savePostEdit(pid)}
                            onDelete={() => void deletePost(pid)}
                            onChangeEditingText={setEditingText}
                            onToggleMute={() =>
                              setMutedByPostId((prev) => ({
                                ...prev,
                                [pid]: !(prev[pid] ?? true),
                              }))
                            }
                            onOpenDetail={() => router.push(`/prispevky/${encodeURIComponent(pid)}`)}
                            canPromote={user?.role === 'ADMIN' && isPromotablePost(p)}
                            promoteHref={
                              user?.role === 'ADMIN' && isPromotablePost(p)
                                ? buildMetaCentrumPromoteUrlFromPost(p)
                                : undefined
                            }
                          />
                        );
                      })
                    )}
                    {postsHasMore ? (
                      <div ref={postsLoadMoreRef} className="py-6 text-center text-sm text-zinc-500">
                        {postsLoadingMore ? 'Načítám další příspěvky…' : 'Načíst další'}
                      </div>
                    ) : null}
                        </div>
                        </div>
                      </main>

                      <aside className="hidden min-w-0 xl:col-span-3 xl:block">
                        <div className="relative z-0 space-y-4 xl:sticky xl:top-20">
                          {renderDesktopSidebarAd()}
                          <RightSidebar className="w-full max-w-full flex-col" />
                        </div>
                      </aside>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex min-h-0 flex-1 flex-col md:hidden">
                    <MobileClassicSwipeFeed items={filteredItems} />
                  </div>
                  <div className="mx-auto hidden w-full max-w-xl px-1 pb-8 pt-1 md:block md:px-3">
                    <PropertyGrid properties={filteredItems} />
                  </div>
                </>
              )}
            </div>
          )}
        </main>
        <div className={`hidden min-h-0 min-w-0 shrink-0 overflow-x-hidden xl:block ${viewMode === 'posts' ? 'xl:hidden' : ''}`}>
          <div className="relative z-0 mb-4 mt-4 space-y-4 xl:sticky xl:top-5">
            {renderDesktopSidebarAd()}
            <NewsHomeBlock limit={5} compact className="hidden xl:block" />
            <RightSidebar className="w-full max-w-full flex-col" />
          </div>
        </div>
      </div>

      {storyViewerOpen && activeStory ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-2 sm:p-6">
          <button
            type="button"
            onClick={() => setStoryViewerOpen(false)}
            className="absolute right-3 top-3 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white"
          >
            Zavřít
          </button>
          <button
            type="button"
            onClick={() => setStoryViewerIndex((prev) => (prev > 0 ? prev - 1 : storyCards.length - 1))}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-white"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setStoryViewerIndex((prev) => (prev + 1) % storyCards.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-white"
          >
            ›
          </button>
          <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-black">
            <div className="flex items-center justify-between px-3 py-2 text-xs text-white/80">
              <span>{activeStory.user.name ?? 'Profesionál'}</span>
              <span>
                {Math.max(0, Math.ceil((new Date(activeStory.expiresAt).getTime() - Date.now()) / 3600000))}h
              </span>
            </div>
            {activeStory.type === 'VIDEO' ? (
              <video
                src={nestAbsoluteAssetUrl(activeStory.mediaUrl)}
                controls
                autoPlay
                playsInline
                className="h-[75vh] w-full object-contain"
              />
            ) : (
              <img
                src={nestAbsoluteAssetUrl(activeStory.mediaUrl)}
                alt={activeStory.user.name ?? 'Příběh'}
                className="h-[75vh] w-full object-contain"
              />
            )}
          </div>
        </div>
      ) : null}

    </div>
  );
}
