'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Building2, Home } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL, nestAbsoluteAssetUrl } from '@/lib/api';
import { loadPropertyFeedItems } from '@/lib/load-feed';
import {
  nestAddPostComment,
  nestFetchCommunityPosts,
  nestFetchPostComments,
  nestFetchShortVideoPublic,
  nestSetPostReaction,
  type ListingPost,
  type PostComment,
  type ShortVideo,
} from '@/lib/nest-client';
import { CreateCommunityPostCard } from '@/components/community/CreateCommunityPostCard';
import { CommunityPostCard } from '@/components/community/CommunityPostCard';
import { PropertyGrid } from '@/components/property-grid';
import { classicListingsOnly } from '@/lib/property-feed-filters';
import type { PropertyFeedItem } from '@/types/property';
import { VideoFeed } from '@/components/video-feed/VideoFeed';
import { Navbar, type ViewMode } from './navbar';
import { RightSidebar } from './right-sidebar';
import { SidebarFilters } from './sidebar-filters';

type Props = {
  items: PropertyFeedItem[];
  /** Wired from `app/page.tsx` — vertical `/videos/*` shorts feed. */
  ShortsFeed: ComponentType<{ items: PropertyFeedItem[] }>;
  /** Production build without NEXT_PUBLIC_API_URL / API_URL. */
  apiConfigMissing?: boolean;
};

const brandBtn =
  'rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-10 py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-white shadow-[0_8px_28px_-6px_rgba(255,106,0,0.45)] transition duration-300 hover:scale-[1.02] hover:shadow-[0_12px_36px_-6px_rgba(255,80,0,0.5)] active:scale-[0.98]';

const COMMUNITY_CATEGORIES = [
  { key: 'MAKLERI', label: 'Makléři', icon: Briefcase },
  { key: 'STAVEBNI_FIRMY', label: 'Stavební firmy', icon: Building2 },
  { key: 'REALITNI_KANCELARE', label: 'Realitní kanceláře', icon: Home },
] as const;
const RADIUS_OPTIONS_KM = [10, 20, 30, 50, 100] as const;

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
  return {
    id,
    videoUrl: typeof row.videoUrl === 'string' ? row.videoUrl : null,
    url: typeof row.url === 'string' ? row.url : undefined,
    title: row.title != null ? String(row.title) : null,
    price: typeof row.price === 'number' ? row.price : Number(row.price) || null,
    city: typeof row.city === 'string' ? row.city : null,
    createdAt,
    publishedAt,
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
  ShortsFeed: _ShortsFeed,
  apiConfigMissing = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh, user, isAuthenticated, apiAccessToken } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

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
    const v = searchParams.get('video')?.trim();
    if (tab === 'shorts' || Boolean(v)) {
      setViewMode('shorts');
    }
  }, [searchParams]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [videoFeed, setVideoFeed] = useState<ShortVideo[]>([]);
  /** Video z deep linku, které ještě není v odpovědi /feed/shorts. */
  const [shareExtraVideo, setShareExtraVideo] = useState<ShortVideo | null>(null);
  const [shareExtraLoading, setShareExtraLoading] = useState(false);
  /** Když `/feed/shorts` vrátí 0 položek — klasický katalog z GET `/properties`. */
  const [shortsFallbackItems, setShortsFallbackItems] = useState<PropertyFeedItem[]>([]);
  const [postFeed, setPostFeed] = useState<Array<Record<string, unknown>>>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const shortsLoadedRef = useRef(false);
  const [activeCategory, setActiveCategory] = useState<
    'MAKLERI' | 'STAVEBNI_FIRMY' | 'REALITNI_KANCELARE'
  >('MAKLERI');
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

  const storyPosts = useMemo(
    () =>
      postFeed.filter((p) => {
        const media = Array.isArray((p as { media?: unknown[] }).media)
          ? ((p as { media?: Array<{ type?: string; url?: string }> }).media ?? [])
          : [];
        const hasVideo = media.some((m) => m?.type === 'video' && (m.url ?? '').trim().length > 0);
        if (!hasVideo) return false;
        const t = String(p.type ?? '');
        return t === 'short';
      }),
    [postFeed],
  );

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
        const count = Number(
          (p._count as { favorites?: number } | undefined)?.favorites ?? 0,
        );
        next[id] = Number.isFinite(count) ? count : 0;
      }
      return next;
    });
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
        const rawList = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        const list = rawList
          .map(feedShortsRowToShortVideo)
          .filter((x): x is ShortVideo => x != null);
        if (cancelled) return;
        setVideoFeed(list);
        if (list.length === 0) {
          const classic = await loadPropertyFeedItems(API_BASE_URL, {
            path: '/properties',
          });
          if (!cancelled) setShortsFallbackItems(classic);
        } else if (!cancelled) {
          setShortsFallbackItems([]);
        }
        shortsLoadedRef.current = true;
      } catch {
        if (!cancelled) {
          setVideoFeed([]);
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
            const count = Number(
              (p._count as { favorites?: number } | undefined)?.favorites ?? 0,
            );
            next[id] = Number.isFinite(count) ? count : 0;
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
      } catch {
        if (!cancelled) setPostFeed([]);
      } finally {
        if (!cancelled) setLoadingFeed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, activeCategory, radiusKm, userCoords?.lat, userCoords?.lng]);

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
        onViewModeChange={setViewMode}
        onMobileFiltersOpen={
          viewMode === 'classic' ? () => setMobileFiltersOpen(true) : undefined
        }
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
              <SidebarFilters className="rounded-xl border-0 shadow-none" />
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={
          viewMode === 'posts'
            ? 'grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 overflow-x-hidden p-0'
            : 'grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 overflow-x-hidden p-0 md:mx-auto md:max-w-[100rem] md:gap-4 md:p-4 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_300px]'
        }
      >
        <div className={`hidden min-h-0 min-w-0 shrink-0 overflow-x-hidden md:block ${viewMode === 'posts' ? 'md:hidden' : ''}`}>
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
                  onClick={() => setViewMode('shorts')}
                  className={brandBtn}
                >
                  Zobrazit nemovitosti
                </button>
                {!isAdmin ? (
                <Link
                    href="/inzerat/pridat"
                  className="rounded-full border border-zinc-300 bg-white px-8 py-3 text-[15px] font-semibold text-zinc-800 transition hover:bg-zinc-50"
                >
                  Vytvořit inzerát
                </Link>
                ) : null}
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
                      onClick={() => setViewMode('classic')}
                      className="rounded-full border border-zinc-300 bg-white px-6 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
                    >
                      Přepnout na klasické zobrazení
                    </button>
                  </div>
                )
              ) : viewMode === 'posts' ? (
                <div className="w-full min-w-0 overflow-x-hidden pb-8 pt-3">
                  <div className="mx-auto w-full max-w-7xl px-4 py-4">
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                      <aside className="xl:col-span-3">
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
                        <div className="sticky top-0 z-20 w-full rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
                          <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                                {COMMUNITY_CATEGORIES.map((cat) => {
                                  const Icon = cat.icon;
                                  const active = activeCategory === cat.key;
                                  return (
                                    <button
                                      key={cat.key}
                                      type="button"
                                      onClick={() => setActiveCategory(cat.key)}
                                      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                                        active
                                          ? 'bg-orange-500 text-white shadow-sm'
                                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                                      }`}
                                    >
                                      <Icon size={16} />
                                      {cat.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <div className="rounded-2xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
                                <select
                                  value={radiusKm}
                                  onChange={(e) =>
                                    setRadiusKm(
                                      Number(e.target.value) as (typeof RADIUS_OPTIONS_KM)[number],
                                    )
                                  }
                                  className="h-8 rounded-xl bg-transparent px-2 text-sm font-medium text-zinc-700 outline-none"
                                >
                                  {RADIUS_OPTIONS_KM.map((radius) => (
                                    <option key={radius} value={radius}>
                                      {radius} km
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <p className="text-xs text-zinc-500">
                                {userCoords
                                  ? `V okruhu ${radiusKm} km od vás`
                                  : geoDenied
                                    ? 'Poloha není povolena'
                                    : 'Získávám polohu...'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {isAuthenticated ? (
                          <div className="mt-4 w-full">
                            <CreateCommunityPostCard
                              apiAccessToken={apiAccessToken}
                              activeCategory={activeCategory}
                              latitude={userCoords?.lat}
                              longitude={userCoords?.lng}
                              onPublished={async () => {
                                setViewMode('posts');
                                await refreshPostsFeed();
                              }}
                            />
                          </div>
                        ) : null}

                        {storyPosts.length > 0 ? (
                          <div className="mt-4 w-full">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Příběhy
                      </p>
                      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                        {storyPosts.map((p) => {
                          const media = ((p as ListingPost).media ?? []).sort(
                            (a, b) => a.order - b.order,
                          );
                          const firstVideo = media.find((m) => m.type === 'video');
                          const src = nestAbsoluteAssetUrl(firstVideo?.url ?? '');
                          if (!src) return null;
                          return (
                            <button
                              key={String(p.id)}
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/?tab=shorts&video=${encodeURIComponent(String(p.id))}`,
                                )
                              }
                              className="flex h-[120px] min-w-[70px] shrink-0 overflow-hidden rounded-xl ring-2 ring-orange-500/25 ring-offset-2 transition hover:ring-orange-500/60"
                            >
                              <video
                                muted
                                playsInline
                                preload="metadata"
                                className="pointer-events-none h-full w-full object-cover"
                                src={src}
                              />
                            </button>
                          );
                        })}
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
                            liked={Boolean(likedByPostId[pid])}
                            disliked={Boolean(dislikedByPostId[pid])}
                            likeCount={
                              likeCountByPostId[pid] ??
                              Number(p._count?.favorites ?? 0)
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
                        <div className="space-y-4 xl:sticky xl:top-20">
                          <div className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold text-zinc-800">Tip</p>
                            <p className="mt-2 text-sm text-zinc-600">
                              Přidávejte krátké, užitečné příspěvky. Největší dosah mají posty s fotkou nebo
                              videem.
                            </p>
                          </div>
                        </div>
                      </aside>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-xl px-3 pb-8 pt-1">
                <PropertyGrid properties={filteredItems} />
                </div>
              )}
            </div>
          )}
        </main>

        <div className={`hidden min-h-0 min-w-0 shrink-0 overflow-x-hidden xl:block ${viewMode === 'posts' ? 'xl:hidden' : ''}`}>
          <RightSidebar className="mt-4 mb-4 w-full max-w-full flex-col" />
        </div>
      </div>
    </div>
  );
}
