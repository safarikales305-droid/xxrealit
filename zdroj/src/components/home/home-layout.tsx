'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Building2, Globe, Home, Landmark, TrendingUp } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL, nestAbsoluteAssetUrl } from '@/lib/api';
import { loadPropertyFeedItems } from '@/lib/load-feed';
import {
  nestAddPostComment,
  nestFetchCommunityPosts,
  nestFetchPostComments,
  nestListPublicStories,
  nestFetchShortVideoPublic,
  nestSetPostReaction,
  type ListingPost,
  type NestStoryRow,
  type PostComment,
  type ShortVideo,
} from '@/lib/nest-client';
import { CreateCommunityPostCard } from '@/components/community/CreateCommunityPostCard';
import { CommunityPostCard } from '@/components/community/CommunityPostCard';
import { PropertyGrid } from '@/components/property-grid';
import { classicListingsOnly } from '@/lib/property-feed-filters';
import { parseApiListingPrice, type PropertyFeedItem } from '@/types/property';
import { VideoFeed } from '@/components/video-feed/VideoFeed';
import { Navbar, type ViewMode } from './navbar';
import { RightSidebar } from './right-sidebar';
import { SidebarFilters } from './sidebar-filters';

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
  { key: 'VSE', label: 'Zobrazit vše', icon: Globe, queryValue: 'all' },
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

  const sharedVideoId = useMemo(
    () => searchParams.get('video')?.trim() || null,
    [searchParams],
  );

  useEffect(() => {
    const tab = searchParams.get('tab');
    const category = parseCategoryFromQuery(searchParams.get('category'));
    const v = searchParams.get('video')?.trim();
    if (tab === 'posts') {
      setViewMode('posts');
      setActiveCategory(category);
      return;
    }
    if (tab === 'shorts' || Boolean(v)) {
      setViewMode('shorts');
      return;
    }
    if (tab === 'classic') {
      setViewMode('classic');
    }
  }, [searchParams]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [videoFeed, setVideoFeed] = useState<ShortVideo[]>([]);
  /** Video z deep linku, které ještě není v odpovědi /feed/shorts. */
  const [shareExtraVideo, setShareExtraVideo] = useState<ShortVideo | null>(null);
  const [shareExtraLoading, setShareExtraLoading] = useState(false);
  /** Když `/feed/shorts` vrátí 0 položek — klasický katalog z GET `/properties`. */
  const [shortsFallbackItems, setShortsFallbackItems] = useState<PropertyFeedItem[]>([]);
  const [shortsTotal, setShortsTotal] = useState<number | null>(null);
  const [postFeed, setPostFeed] = useState<Array<Record<string, unknown>>>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const shortsLoadedRef = useRef(false);
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
  const createPostCategory = activeCategory === 'VSE' ? 'MAKLERI' : activeCategory;

  const storyCards = useMemo(() => stories.slice(0, 20), [stories]);
  const activeStory = storyCards[storyViewerIndex] ?? null;
  const sidebarSeedPropertyId = useMemo(() => {
    for (const p of items) {
      const id = String(p.id ?? '').trim();
      if (id.length > 0) return id;
    }
    return '';
  }, [items]);

  async function refreshPostsFeed() {
    if (!API_BASE_URL) return;
    const res = await fetch(`${API_BASE_URL}/feed/posts`, { cache: 'no-store' });
    const data = (await res.json().catch(() => [])) as unknown;
    const list = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    setPostFeed(list);
    setLikeCountByPostId((prev) => {
      const next = { ...prev };
      for (const p of list) {
        const id = String(p.id ?? '');
        if (!id) continue;
        const likes = Number(
          ((p as { reactions?: Array<{ type?: string }> }).reactions ?? []).filter(
            (r) => r.type === 'LIKE',
          ).length,
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
          ((p as { reactions?: Array<{ type?: string }> }).reactions ?? []).filter(
            (r) => r.type === 'DISLIKE',
          ).length,
        );
        next[id] = Number.isFinite(dislikes) ? dislikes : 0;
      }
      return next;
    });
    if (user?.id) {
      setLikedByPostId((prev) => {
        const next = { ...prev };
        for (const p of list) {
          const id = String(p.id ?? '');
          if (!id) continue;
          const mine = ((p as { reactions?: Array<{ userId?: string; type?: string }> }).reactions ?? []).find(
            (r) => String(r.userId ?? '') === user.id,
          );
          next[id] = mine?.type === 'LIKE';
        }
        return next;
      });
      setDislikedByPostId((prev) => {
        const next = { ...prev };
        for (const p of list) {
          const id = String(p.id ?? '');
          if (!id) continue;
          const mine = ((p as { reactions?: Array<{ userId?: string; type?: string }> }).reactions ?? []).find(
            (r) => String(r.userId ?? '') === user.id,
          );
          next[id] = mine?.type === 'DISLIKE';
        }
        return next;
      });
    }
  }

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
    if (process.env.NODE_ENV === 'production') return;
    if (classicGridItems.length > 0) {
      // eslint-disable-next-line no-console
      console.log('CLASSIC LISTING SAMPLE', classicGridItems[0]);
    }
  }, [classicGridItems]);

  const filteredItems = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    if (!s) return classicGridItems;
    return classicGridItems.filter(
      (p) =>
        p.title.toLowerCase().includes(s) ||
        p.location.toLowerCase().includes(s),
    );
  }, [classicGridItems, searchQuery]);

  const classicShortsFallbackGrid = useMemo(
    () => classicListingsOnly(shortsFallbackItems),
    [shortsFallbackItems],
  );

  const filteredShortsFallback = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    if (!s) return classicShortsFallbackGrid;
    return classicShortsFallbackGrid.filter(
      (p) =>
        p.title.toLowerCase().includes(s) ||
        p.location.toLowerCase().includes(s),
    );
  }, [classicShortsFallbackGrid, searchQuery]);

  const videosForFeed = useMemo(() => {
    function sortKey(v: ShortVideo): number {
      const p = v.publishedAt ? Date.parse(v.publishedAt) : NaN;
      const c = Date.parse(v.createdAt);
      const primary = Number.isFinite(p) ? p : c;
      return Number.isFinite(primary) ? primary : 0;
    }
    function sortByCreatedDesc(list: ShortVideo[]): ShortVideo[] {
      return [...list].sort((a, b) => sortKey(b) - sortKey(a));
    }
    const seen = new Set<string>();
    const merged: ShortVideo[] = [];
    if (shareExtraVideo) {
      merged.push(shareExtraVideo);
      seen.add(shareExtraVideo.id);
    }
    for (const v of videoFeed) {
      if (!seen.has(v.id)) {
        merged.push(v);
        seen.add(v.id);
      }
    }
    if (!sharedVideoId) return sortByCreatedDesc(merged);
    const idx = merged.findIndex((v) => v.id === sharedVideoId);
    if (idx === -1) return sortByCreatedDesc(merged);
    const picked = merged[idx];
    const rest = merged.filter((_, i) => i !== idx);
    return [picked, ...sortByCreatedDesc(rest)];
  }, [videoFeed, sharedVideoId, shareExtraVideo]);

  const shareMissingInFeed = Boolean(
    sharedVideoId && !videoFeed.some((v) => v.id === sharedVideoId),
  );
  const shortsBootstrapBusy = loadingFeed || (shareMissingInFeed && shareExtraLoading);

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
  const showNoSearchHitsShortsFallback =
    viewMode === 'shorts' &&
    !shortsBootstrapBusy &&
    videosForFeed.length === 0 &&
    classicShortsFallbackGrid.length > 0 &&
    filteredShortsFallback.length === 0;

  const communityFeedPosts = useMemo(
    () =>
      postFeed.filter((row) => {
        const t = String((row as ListingPost).type ?? '');
        return t !== 'short';
      }),
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
    if (shortsLoadedRef.current) return;
    let cancelled = false;
    setLoadingFeed(true);

    void (async () => {
      try {
        const shortsUrl = `${API_BASE_URL}/feed/shorts`;
        const res = await fetch(shortsUrl, {
          next: { revalidate: 20 },
        });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn(
            `[HomeLayout] GET shorts feed failed: ${res.status} ${res.statusText} — ${shortsUrl}`,
          );
        }
        const data = res.ok ? await res.json() : [];
        const rawList = Array.isArray(data)
          ? (data as Record<string, unknown>[])
          : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
            ? ((data as { items: Record<string, unknown>[] }).items ?? [])
            : [];
        const totalFromApi =
          data && typeof data === 'object' && !Array.isArray(data)
            ? Number((data as { total?: unknown }).total)
            : NaN;
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.debug(
            '[HomeLayout][shorts api viewsCount]',
            rawList.slice(0, 8).map((r) => ({
              id: String(r.id ?? ''),
              viewsCount: r.viewsCount ?? null,
            })),
          );
        }
        const list = rawList
          .map(feedShortsRowToShortVideo)
          .filter((x): x is ShortVideo => x != null);
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.debug(
            '[HomeLayout][shorts mapped viewsCount]',
            list.slice(0, 8).map((r) => ({
              id: r.id,
              viewsCount: r.viewsCount ?? null,
            })),
          );
        }
        if (cancelled) return;
        setVideoFeed(list);
        setShortsTotal(
          Number.isFinite(totalFromApi) && totalFromApi >= 0
            ? Math.trunc(totalFromApi)
            : list.length,
        );
        if (list.length === 0) {
          const classic = await loadPropertyFeedItems(API_BASE_URL, {
            path: '/properties',
          });
          if (!cancelled) setShortsFallbackItems(classic.items);
        } else if (!cancelled) {
          setShortsFallbackItems([]);
        }
        shortsLoadedRef.current = true;
      } catch {
        if (!cancelled) {
          setVideoFeed([]);
          setShortsTotal(0);
          setShortsFallbackItems([]);
          shortsLoadedRef.current = true;
        }
      } finally {
        if (!cancelled) setLoadingFeed(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== 'posts') return;
    let cancelled = false;
    setLoadingFeed(true);
    void (async () => {
      try {
        const list = await nestFetchCommunityPosts(activeCategory, {
          radiusKm,
          lat: userCoords?.lat,
          lng: userCoords?.lng,
        });
        if (cancelled) return;
        setPostFeed(list as Array<Record<string, unknown>>);
        setLikeCountByPostId((prev) => {
          const next = { ...prev };
          for (const p of list as Array<Record<string, unknown>>) {
            const id = String(p.id ?? '');
            if (!id) continue;
            const likes = Number(
              ((p as { reactions?: Array<{ type?: string }> }).reactions ?? []).filter(
                (r) => r.type === 'LIKE',
              ).length,
            );
            next[id] = Number.isFinite(likes) ? likes : 0;
          }
          return next;
        });
        setDislikeCountByPostId((prev) => {
          const next = { ...prev };
          for (const p of list as Array<Record<string, unknown>>) {
            const id = String(p.id ?? '');
            if (!id) continue;
            const dislikes = Number(
              ((p as { reactions?: Array<{ type?: string }> }).reactions ?? []).filter(
                (r) => r.type === 'DISLIKE',
              ).length,
            );
            next[id] = Number.isFinite(dislikes) ? dislikes : 0;
          }
          return next;
        });
        if (user?.id) {
          setLikedByPostId((prev) => {
            const next = { ...prev };
            for (const p of list as Array<Record<string, unknown>>) {
              const id = String(p.id ?? '');
              if (!id) continue;
              const mine = ((p as { reactions?: Array<{ userId?: string; type?: string }> }).reactions ?? []).find(
                (r) => String(r.userId ?? '') === user.id,
              );
              next[id] = mine?.type === 'LIKE';
            }
            return next;
          });
          setDislikedByPostId((prev) => {
            const next = { ...prev };
            for (const p of list as Array<Record<string, unknown>>) {
              const id = String(p.id ?? '');
              if (!id) continue;
              const mine = ((p as { reactions?: Array<{ userId?: string; type?: string }> }).reactions ?? []).find(
                (r) => String(r.userId ?? '') === user.id,
              );
              next[id] = mine?.type === 'DISLIKE';
            }
            return next;
          });
        }
      } catch {
        if (!cancelled) setPostFeed([]);
      } finally {
        if (!cancelled) setLoadingFeed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, activeCategory, radiusKm, userCoords?.lat, userCoords?.lng, user?.id]);

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
        viewMode={viewMode}
        onViewModeChange={onChangeViewMode}
        onMobileFiltersOpen={
          viewMode === 'classic' ? () => setMobileFiltersOpen(true) : undefined
        }
        activePostsCategoryLabel={viewMode === 'posts' ? activeCategoryLabel : undefined}
      />

      {mobileFiltersOpen ? (
        <div
          className="fixed inset-0 z-[60] flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtry"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label="Zavřít filtry"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="relative ml-auto flex h-full w-[min(100%,20rem)] flex-col overflow-y-auto overscroll-contain bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
              <span className="text-[15px] font-semibold text-zinc-900">
                Filtry
              </span>
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-xl text-lg text-zinc-600 transition hover:bg-zinc-100"
                aria-label="Zavřít"
                onClick={() => setMobileFiltersOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <SidebarFilters
                className="rounded-xl border-0 shadow-none"
                onFiltersApplied={() => setMobileFiltersOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={
          viewMode === 'posts'
            ? 'grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 overflow-x-hidden p-0'
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
        </div>

        <main
          className={
            !hasData && viewMode === 'classic'
              ? 'relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)] md:min-w-0'
              : viewMode === 'shorts' && !shortsBootstrapBusy && videosForFeed.length === 0
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
          ) : showNoSearchHits || showNoSearchHitsShortsFallback ? (
            <div className="flex min-h-[min(24rem,50vh)] flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <p className="text-lg font-semibold text-zinc-800">
                Žádné výsledky pro „{searchQuery.trim()}“
              </p>
              <p className="max-w-sm text-sm text-zinc-500">
                Zkuste jiný výraz nebo přepněte zpět na zobrazení Shorts /
                Klasicky.
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
                ) : videosForFeed.length > 0 ? (
                  <VideoFeed
                    key={sharedVideoId ?? 'feed'}
                    videos={videosForFeed}
                    onMobileFiltersOpen={
                      viewMode === 'shorts'
                        ? () => setMobileFiltersOpen(true)
                        : undefined
                    }
                  />
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
                <div className="w-full min-w-0 overflow-x-hidden pb-8 pt-3">
                  <div className="mx-auto w-full max-w-7xl px-1 py-3 sm:px-3 md:px-4">
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                      <aside className="hidden xl:col-span-3 xl:block">
                        <div className="space-y-4 lg:sticky lg:top-20">
                          <div className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold text-zinc-800">Přehled</p>
                            <p className="mt-2 text-sm text-zinc-600">
                              Komunitní příspěvky podle oboru. Na mobilu použijte horní lištu v hlavním
                              sloupci.
                            </p>
                          </div>
                        </div>
                      </aside>

                      <main className="min-w-0 xl:col-span-6">
                        <div className="sticky top-0 z-20 w-full rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur md:p-3">
                          <div className="flex w-full min-w-0 items-center justify-between gap-2 md:gap-3">
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
                              <p className="mt-1 text-xs font-semibold text-zinc-700 md:hidden">
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

                        {isAuthenticated ? (
                          <div className="mt-2 w-full md:mt-4">
                            <CreateCommunityPostCard
                              apiAccessToken={apiAccessToken}
                              activeCategory={createPostCategory}
                              latitude={userCoords?.lat}
                              longitude={userCoords?.lng}
                              onPublished={async () => {
                                onChangeViewMode('posts');
                                await refreshPostsFeed();
                              }}
                            />
                          </div>
                        ) : null}

                        {!isAuthenticated ? (
                          <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Přihlášení k příspěvkům"
                            className="pointer-events-none fixed inset-x-0 bottom-0 top-16 z-[90] flex items-center justify-center px-4 md:top-20"
                          >
                            <div
                              className="pointer-events-none absolute inset-0 bg-black/35 backdrop-blur-[2px]"
                              aria-hidden
                            />
                            <div className="pointer-events-auto relative w-full max-w-md rounded-3xl border border-orange-200 bg-white/95 p-6 text-center shadow-xl">
                              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Příspěvky
                              </p>
                              <h2 className="mt-1 text-xl font-bold text-zinc-900">
                                Přihlaste se
                              </h2>
                              <p className="mt-2 text-sm text-zinc-600">
                                Přihlaste se, jinak neuvidíte příspěvky.
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(
                                    `/prihlaseni?redirect=${encodeURIComponent('/?tab=posts')}`,
                                  )
                                }
                                className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                              >
                                Přihlaste se
                              </button>
                            </div>
                          </div>
                        ) : null}

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

                        <div className="mt-4 flex w-full min-w-0 flex-col gap-4">
                    {loadingFeed ? (
                      <p className="text-sm text-zinc-600">Načítám příspěvky…</p>
                    ) : communityFeedPosts.length === 0 ? (
                      <p className="text-sm text-zinc-600">Zatím žádné příspěvky.</p>
                    ) : (
                      communityFeedPosts.map((row) => {
                        const p = row as ListingPost;
                        const pid = String(p.id ?? '');
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
                              Number((p.reactions ?? []).filter((r) => r.type === 'LIKE').length)
                            }
                            dislikeCount={dislikeCountByPostId[pid] ?? 0}
                            muted={mutedByPostId[pid] ?? true}
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
                          />
                        );
                      })
                    )}
                        </div>
                      </main>

                      <aside className="hidden xl:block xl:col-span-3">
                        <div className="relative z-0 space-y-4 xl:sticky xl:top-20">
                          {renderDesktopSidebarAd()}
                          <RightSidebar className="w-full max-w-full flex-col" />
                        </div>
                      </aside>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-xl px-1 pb-8 pt-1 md:px-3">
                <PropertyGrid properties={filteredItems} />
                </div>
              )}
            </div>
          )}
        </main>
        <div className={`hidden min-h-0 min-w-0 shrink-0 overflow-x-hidden xl:block ${viewMode === 'posts' ? 'xl:hidden' : ''}`}>
          <div className="relative z-0 mb-4 mt-4 space-y-4 xl:sticky xl:top-5">
            {renderDesktopSidebarAd()}
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
