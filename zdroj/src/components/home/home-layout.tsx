'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  Building2,
  Heart,
  Home,
  Image as ImageIcon,
  MessageCircle,
  Send,
  ThumbsDown,
  Video,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL, nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestAddPostComment,
  nestCreateListingPost,
  nestFetchCommunityPosts,
  nestFetchPostComments,
  nestSetPostReaction,
  nestTogglePostFavorite,
  type ListingPost,
  type PostComment,
  type ShortVideo,
} from '@/lib/nest-client';
import { PropertyGrid } from '@/components/property-grid';
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

/**
 * Light shell + Shorts (TikTok) / Classic (Sreality-style grid).
 */
export function HomeLayout({
  items,
  ShortsFeed,
  apiConfigMissing = false,
}: Props) {
  const router = useRouter();
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [videoFeed, setVideoFeed] = useState<ShortVideo[]>([]);
  const [postFeed, setPostFeed] = useState<Array<Record<string, unknown>>>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postPrice, setPostPrice] = useState('');
  const [postCity, setPostCity] = useState('');
  const [activeCategory, setActiveCategory] = useState<
    'MAKLERI' | 'STAVEBNI_FIRMY' | 'REALITNI_KANCELARE'
  >('MAKLERI');
  const [radiusKm, setRadiusKm] = useState<(typeof RADIUS_OPTIONS_KM)[number]>(30);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [postMedia, setPostMedia] = useState<File | null>(null);
  const [postImages, setPostImages] = useState<File[]>([]);
  const [dragImageIndex, setDragImageIndex] = useState<number | null>(null);
  const [postVideo, setPostVideo] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [postMediaError, setPostMediaError] = useState<string | null>(null);
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
  const postMediaInputRef = useRef<HTMLInputElement | null>(null);
  const postTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  useEffect(() => {
    if (!postVideo) {
      setVideoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(postVideo);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [postVideo]);

  useEffect(() => {
    if (postImages.length === 0) {
      setImagePreviewUrls([]);
      return;
    }
    const urls = postImages.map((img) => URL.createObjectURL(img));
    setImagePreviewUrls(urls);
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [postImages]);

  function handleMediaChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPostMediaError(null);
    const files = Array.from(e.target.files ?? []);
    const file = files[0] ?? null;
    if (!file && files.length === 0) {
      setPostMedia(null);
      setPostVideo(null);
      setPostImages([]);
      return;
    }
    const videoFiles = files.filter((f) => f.type.startsWith('video/'));
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (videoFiles.length > 1) {
      setPostMediaError('Only 1 video allowed');
      e.target.value = '';
      return;
    }
    if (imageFiles.length > 30) {
      setPostMediaError('Max 30 images');
      e.target.value = '';
      return;
    }
    for (const f of files) {
      if (!f.type.startsWith('video/') && !f.type.startsWith('image/')) {
        setPostMediaError('Povolené jsou pouze video nebo obrázek.');
        e.target.value = '';
        return;
      }
      if (f.size > 300 * 1024 * 1024) {
        setPostMediaError('Maximální velikost souboru je 300 MB.');
        e.target.value = '';
        return;
      }
    }
    setPostVideo(videoFiles[0] ?? null);
    setPostImages(imageFiles);
    setPostMedia(videoFiles[0] ?? imageFiles[0] ?? file ?? null);
  }

  function moveImage(from: number, to: number) {
    setPostImages((prev) => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function handlePostContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setPostContent(value);
  }

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

  async function toggleFavorite(postId: string) {
    if (!apiAccessToken) return;
    const optimisticLiked = !Boolean(likedByPostId[postId]);
    const previousLiked = Boolean(likedByPostId[postId]);
    const previousCount = likeCountByPostId[postId] ?? 0;

    setLikedByPostId((prev) => ({ ...prev, [postId]: optimisticLiked }));
    setLikeCountByPostId((prev) => ({
      ...prev,
      [postId]: Math.max(0, previousCount + (optimisticLiked ? 1 : -1)),
    }));

    const res = await nestTogglePostFavorite(apiAccessToken, postId);
    if (!res.ok) {
      setLikedByPostId((prev) => ({ ...prev, [postId]: previousLiked }));
      setLikeCountByPostId((prev) => ({ ...prev, [postId]: previousCount }));
      return;
    }

    setLikedByPostId((prev) => ({ ...prev, [postId]: res.liked }));
    setLikeCountByPostId((prev) => ({ ...prev, [postId]: res.likeCount }));
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

  const filteredItems = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (p) =>
        p.title.toLowerCase().includes(s) ||
        p.location.toLowerCase().includes(s),
    );
  }, [items, searchQuery]);

  const hasData = items.length > 0;
  const showNoSearchHits = hasData && filteredItems.length === 0;

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
    if (!API_BASE_URL) return;
    setLoadingFeed(true);
    const loader =
      viewMode === 'shorts'
        ? fetch(`${API_BASE_URL}/feed/shorts`, { cache: 'no-store' }).then((res) =>
            res.ok ? res.json() : [],
          )
        : viewMode === 'posts'
          ? nestFetchCommunityPosts(activeCategory, {
              radiusKm,
              lat: userCoords?.lat,
              lng: userCoords?.lng,
            })
          : Promise.resolve([]);
    void loader
      .then((data) => {
        const list = Array.isArray(data) ? (data as ShortVideo[]) : [];
        if (viewMode === 'shorts') setVideoFeed(list);
        if (viewMode === 'posts') {
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
        }
      })
      .catch(() => {
        if (viewMode === 'shorts') setVideoFeed([]);
        if (viewMode === 'posts') setPostFeed([]);
      })
      .finally(() => setLoadingFeed(false));
  }, [viewMode, activeCategory, radiusKm, userCoords?.lat, userCoords?.lng]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();

    if (!API_BASE_URL || !user || !apiAccessToken) return;

    const text = postContent.trim();
    if (!postMedia && !text && !postTitle.trim()) return;

    setPostMediaError(null);
    setCreatingPost(true);
    try {
      if (postMedia || postTitle.trim()) {
        console.log('LISTING SUBMIT START', {
          hasVideo: Boolean(postVideo),
          imageCount: postImages.length,
          imageOrder: postImages.map((f) => `${f.name}::${f.size}`),
        });
        const r = await nestCreateListingPost(apiAccessToken, {
          title: postTitle.trim() || 'Inzerát',
          description: text || postTitle.trim() || 'Inzerát',
          price: Number(postPrice || 0),
          city: postCity.trim() || 'Neuvedeno',
          type: postVideo ? 'short' : 'post',
          category: activeCategory,
          latitude: userCoords?.lat,
          longitude: userCoords?.lng,
          video: postVideo,
          images: postImages,
          imageOrder: postImages.map((f) => `${f.name}::${f.size}`),
        });
        console.log('LISTING SUBMIT RESPONSE', r);
        if (!r.ok) {
          alert('Upload selhal');
          setPostMediaError(r.error ?? 'Upload média selhal.');
          return;
        }
        setPostMedia(null);
        setPostVideo(null);
        setPostImages([]);
        setPostTitle('');
        setPostPrice('');
        setPostCity('');
        setPostContent('');
        if (postMediaInputRef.current) {
          postMediaInputRef.current.value = '';
        }
      } else {
        const postsBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
        const postRes = await fetch(`${postsBase}/posts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiAccessToken}`,
          },
          body: JSON.stringify({ content: text }),
        });
        if (!postRes.ok) {
          alert('Odeslání příspěvku selhalo');
          return;
        }
        setPostContent('');
      }

      setViewMode('posts');
      await refreshPostsFeed();
    } finally {
      setCreatingPost(false);
    }
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
        onViewModeChange={setViewMode}
        onMobileFiltersOpen={viewMode === 'posts' ? undefined : () => setMobileFiltersOpen(true)}
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

      <div className="grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 overflow-x-hidden p-0 md:mx-auto md:max-w-[100rem] md:gap-4 md:p-4 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_300px]">
        <div className={`hidden min-h-0 min-w-0 shrink-0 overflow-x-hidden md:block ${viewMode === 'posts' ? 'md:hidden' : ''}`}>
          <SidebarFilters className="mt-0 w-full max-w-full flex-col md:mt-2 md:mb-2 lg:mt-4 lg:mb-4" />
        </div>

        <main
          className={
            !hasData && viewMode === 'classic'
              ? 'relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)] md:min-w-0'
              : viewMode === 'shorts'
                ? 'relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden rounded-2xl bg-black shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)] md:min-w-0 lg:ring-1 lg:ring-black/10'
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
          ) : showNoSearchHits ? (
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
                loadingFeed ? (
                  <div className="flex h-full items-center justify-center text-sm text-white/80">
                    Načítám video feed...
                  </div>
                ) : (
                  <VideoFeed videos={videoFeed} />
                )
              ) : viewMode === 'posts' ? (
                <div className="w-full pb-8 pt-3">
                  <div className="sticky top-0 z-30 mb-4 border-b border-zinc-200 bg-white/90 backdrop-blur">
                    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
                      <div className="flex-1">
                        <div className="no-scrollbar flex gap-2 overflow-x-auto">
                          {COMMUNITY_CATEGORIES.map((cat) => {
                            const Icon = cat.icon;
                            const active = activeCategory === cat.key;
                            return (
                              <button
                                key={cat.key}
                                type="button"
                                onClick={() => setActiveCategory(cat.key)}
                                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
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
                      <div className="flex items-center gap-2">
                        <div className="rounded-2xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
                          <select
                            value={radiusKm}
                            onChange={(e) => setRadiusKm(Number(e.target.value) as (typeof RADIUS_OPTIONS_KM)[number])}
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
                  <div className="mx-auto grid w-full max-w-7xl grid-cols-12 gap-4 px-3 md:gap-6 md:px-4">
                  <aside className="col-span-12 lg:col-span-3">
                  {isAuthenticated ? (
                    <form
                      onSubmit={(e) => void handleSubmit(e)}
                      className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-[96px]"
                    >
                      <div className="mb-2 grid grid-cols-2 gap-2">
                        <input
                          value={postTitle}
                          onChange={(e) => setPostTitle(e.target.value)}
                          placeholder="Název inzerátu"
                          className="h-9 rounded-xl border border-zinc-200 px-2 text-sm"
                        />
                        <input
                          value={postCity}
                          onChange={(e) => setPostCity(e.target.value)}
                          placeholder="Město"
                          className="h-9 rounded-xl border border-zinc-200 px-2 text-sm"
                        />
                        <input
                          value={postPrice}
                          onChange={(e) => setPostPrice(e.target.value.replace(/[^\d]/g, ''))}
                          placeholder="Cena (Kč)"
                          className="h-9 rounded-xl border border-zinc-200 px-2 text-sm"
                        />
                      </div>
                      <textarea
                        ref={postTextareaRef}
                        rows={1}
                        value={postContent}
                        onChange={handlePostContentChange}
                        onInput={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                        }}
                        placeholder="Co máte nového?"
                        className="min-h-[44px] w-full resize-none overflow-hidden rounded-2xl border border-slate-200 bg-zinc-50/80 px-4 py-3 text-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/15"
                      />
                      <input
                        ref={postMediaInputRef}
                        type="file"
                        accept="video/*,image/*"
                        multiple
                        className="sr-only"
                        aria-label="Vybrat video nebo obrázek"
                        onChange={handleMediaChange}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {postMedia ? (
                          <>
                            <span className="max-w-[min(100%,14rem)] truncate text-xs text-zinc-500">
                              {postMedia.name}
                            </span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-red-600 hover:underline"
                              onClick={() => {
                                setPostMedia(null);
                                setPostVideo(null);
                                setPostImages([]);
                                setPostMediaError(null);
                                if (postMediaInputRef.current) {
                                  postMediaInputRef.current.value = '';
                                }
                              }}
                            >
                              Odebrat
                            </button>
                          </>
                        ) : null}
                      </div>
                      {postMediaError ? (
                        <p className="mt-2 text-sm font-medium text-red-600" role="alert">
                          {postMediaError}
                        </p>
                      ) : null}
                      {(videoPreviewUrl || imagePreviewUrls.length > 0) ? (
                        <div className="mt-3 space-y-2">
                          {videoPreviewUrl ? (
                            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                              <div className="relative">
                                <video
                                  muted
                                  playsInline
                                  autoPlay
                                  loop
                                  controls
                                  preload="metadata"
                                  className="h-auto w-full object-contain"
                                  src={videoPreviewUrl}
                                />
                                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">
                                  Video / bude první
                                </span>
                              </div>
                            </div>
                          ) : null}

                          {postImages.map((img, idx) => (
                            <div
                              key={`${img.name}-${idx}`}
                              draggable
                              onDragStart={() => setDragImageIndex(idx)}
                              onDragEnd={() => setDragImageIndex(null)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                if (dragImageIndex == null) return;
                                moveImage(dragImageIndex, idx);
                                setDragImageIndex(null);
                              }}
                              className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
                            >
                              <div className="relative">
                                <img
                                  src={imagePreviewUrls[idx]}
                                  alt={img.name}
                                  className="h-40 w-full object-cover"
                                />
                                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">
                                  {videoPreviewUrl ? idx + 1 : idx + 1}
                                </span>
                              </div>
                              <div className="flex items-center justify-between px-2 py-1 text-xs">
                                <span className="truncate pr-2">{img.name}</span>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moveImage(idx, idx - 1)}
                                    disabled={idx === 0}
                                    className="rounded border border-zinc-200 px-2 py-0.5 disabled:opacity-40"
                                  >
                                    ←
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveImage(idx, idx + 1)}
                                    disabled={idx === postImages.length - 1}
                                    className="rounded border border-zinc-200 px-2 py-0.5 disabled:opacity-40"
                                  >
                                    →
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => postMediaInputRef.current?.click()}
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-orange-600 transition hover:bg-orange-50"
                          title="Přidat video nebo obrázek"
                          aria-label="Přidat média"
                        >
                          {postMedia?.type.startsWith('video') ? <Video size={18} /> : <ImageIcon size={18} />}
                        </button>
                        <button
                          type="submit"
                          disabled={creatingPost || (!postMedia && !postContent.trim())}
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
                        >
                          <Send size={14} />
                          {creatingPost
                            ? postMedia
                              ? 'Nahrávám…'
                              : 'Odesílám…'
                            : 'Přidat'}
                        </button>
                      </div>
                    </form>
                  ) : null}
                  </aside>
                  <main className="col-span-12 lg:col-span-6">

                  {storyPosts.length > 0 ? (
                    <div className="mb-6">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Příběhy
                      </p>
                      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 no-scrollbar">
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
                              onClick={() => router.push(`/post/${String(p.id)}`)}
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

                  <div className="flex w-full flex-col gap-4">
                    {loadingFeed ? (
                      <p className="text-sm text-zinc-600">Načítám příspěvky…</p>
                    ) : postFeed.length === 0 ? (
                      <p className="text-sm text-zinc-600">Zatím žádné příspěvky.</p>
                    ) : (
                      postFeed.map((p) => {
                        const media = ((p as ListingPost).media ?? []).sort(
                          (a, b) => a.order - b.order,
                        );
                        if (media.length === 0) return null;
                        const firstVideo = media.find((m) => m.type === 'video');
                        const firstImage = media.find((m) => m.type === 'image');
                        const videoRaw = String(firstVideo?.url ?? '').trim();
                        const imageRaw = String(firstImage?.url ?? '').trim();
                        const showFeedVideo = Boolean(videoRaw);
                        const showFeedImage = !showFeedVideo && Boolean(imageRaw);

                        return (
                        <article
                          key={String(p.id ?? Math.random())}
                          className="relative w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                        >
                          {String((p.user as { id?: string } | undefined)?.id ?? '') ===
                          String(user?.id ?? '') ? (
                            <div className="absolute right-3 top-3 flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPostId(String(p.id ?? ''));
                                  setEditingText(String(p.description ?? p.content ?? ''));
                                }}
                                className="flex size-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm shadow-sm"
                                aria-label="Upravit příspěvek"
                                title="Upravit"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => void deletePost(String(p.id ?? ''))}
                                className="flex size-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm shadow-sm"
                                aria-label="Smazat příspěvek"
                                title="Smazat"
                              >
                                🗑️
                              </button>
                            </div>
                          ) : null}
                          <p className="px-3 pt-3 text-xs font-medium text-zinc-500 md:px-4 md:pt-4">
                            {String(
                              ((p.user as { name?: string } | undefined)?.name ??
                                (p.user as { email?: string } | undefined)?.email ??
                                'Autor'),
                            )}
                          </p>
                          {Number.isFinite((p as ListingPost).distanceKm) ? (
                            <p className="px-3 pt-1 text-[11px] font-medium text-zinc-500 md:px-4">
                              {Number((p as ListingPost).distanceKm).toFixed(1)} km od vás
                            </p>
                          ) : null}
                          {editingPostId === String(p.id ?? '') ? (
                            <div className="mt-2 px-3 pb-2 md:px-4">
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                rows={1}
                                onInput={(e) => {
                                  e.currentTarget.style.height = 'auto';
                                  e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                                }}
                                className="w-full resize-none overflow-hidden rounded-xl border border-zinc-200 p-2 text-sm"
                              />
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void savePostEdit(String(p.id ?? ''))}
                                  className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  Uložit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPostId(null);
                                    setEditingText('');
                                  }}
                                  className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs"
                                >
                                  Zrušit
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {showFeedImage ? (
                            <button
                              type="button"
                              className="mt-3 block w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] text-left md:relative md:left-auto md:right-auto md:-ml-0 md:-mr-0 md:w-full"
                              onClick={() => router.push(`/post/${String(p.id)}`)}
                            >
                              <div className="relative w-full overflow-hidden bg-black">
                                <img
                                  src={nestAbsoluteAssetUrl(imageRaw)}
                                  alt=""
                                  className="h-auto w-full object-contain"
                                />
                              </div>
                            </button>
                          ) : null}
                          {showFeedVideo ? (
                            <button
                              type="button"
                              className="mt-3 block w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] text-left md:relative md:left-auto md:right-auto md:-ml-0 md:-mr-0 md:w-full"
                              onClick={() => router.push(`/post/${String(p.id)}`)}
                            >
                              <div className="w-full bg-black">
                                <video
                                  src={nestAbsoluteAssetUrl(videoRaw)}
                                  playsInline
                                  muted={
                                    mutedByPostId[String(p.id ?? '')] ?? true
                                  }
                                  controls
                                  preload="metadata"
                                  className="h-auto w-full object-contain"
                                />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                                  <p className="text-sm">{String((p as ListingPost).title ?? '')}</p>
                                  <p className="text-lg font-bold">
                                    <span className={!isAuthenticated ? 'blur-sm' : ''}>
                                      {Number((p as ListingPost).price ?? 0).toLocaleString('cs-CZ')} Kč
                                    </span>
                                  </p>
                                  <p className="text-xs">{String((p as ListingPost).city ?? '')}</p>
                                </div>
                              </div>
                            </button>
                          ) : null}
                          {editingPostId !== String(p.id ?? '') ? (
                          <div className="px-3 py-2">
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                                {String((p as ListingPost).description ?? p.description ?? p.content ?? '')}
                              </p>
                            </div>
                          ) : null}
                          {showFeedVideo ? (
                            <button
                              type="button"
                              onClick={() =>
                                setMutedByPostId((prev) => ({
                                  ...prev,
                                  [String(p.id ?? '')]: !(
                                    prev[String(p.id ?? '')] ?? true
                                  ),
                                }))
                              }
                              className="mt-2 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
                            >
                              {(mutedByPostId[String(p.id ?? '')] ?? true)
                                ? '🔇'
                                : '🔊'}
                            </button>
                          ) : null}
                          <div className="mt-3 flex items-center gap-2 px-3 pb-3 text-xs text-zinc-600 md:px-4 md:pb-4">
                            <button
                              type="button"
                              onClick={() => void toggleReaction(String(p.id ?? ''), 'LIKE')}
                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 ${
                                likedByPostId[String(p.id ?? '')]
                                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                                  : 'border-zinc-200 bg-white text-zinc-600'
                              }`}
                              aria-label="Přepnout oblíbené"
                            >
                              <Heart size={14} />
                              <span>{likeCountByPostId[String(p.id ?? '')] ?? Number((p._count as { favorites?: number } | undefined)?.favorites ?? 0)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleReaction(String(p.id ?? ''), 'DISLIKE')}
                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 ${
                                dislikedByPostId[String(p.id ?? '')]
                                  ? 'border-slate-300 bg-slate-100 text-slate-700'
                                  : 'border-zinc-200 bg-white text-zinc-600'
                              }`}
                            >
                              <ThumbsDown size={14} />
                              <span>{dislikeCountByPostId[String(p.id ?? '')] ?? 0}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const postId = String(p.id ?? '');
                                const nextOpen = !Boolean(commentsOpenByPostId[postId]);
                                setCommentsOpenByPostId((prev) => ({ ...prev, [postId]: nextOpen }));
                                if (nextOpen) {
                                  void loadComments(postId);
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5"
                            >
                              <MessageCircle size={14} />
                              {commentsByPostId[String(p.id ?? '')]?.length ??
                                Number((p._count as { comments?: number } | undefined)?.comments ?? 0)}
                            </button>
                          </div>
                          {commentsOpenByPostId[String(p.id ?? '')] ? (
                            <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3">
                              <div className="flex items-center gap-2">
                                <input
                                  value={commentInputByPostId[String(p.id ?? '')] ?? ''}
                                  onChange={(e) =>
                                    setCommentInputByPostId((prev) => ({
                                      ...prev,
                                      [String(p.id ?? '')]: e.target.value,
                                    }))
                                  }
                                  placeholder="Napsat komentář..."
                                  className="h-9 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => void sendComment(String(p.id ?? ''))}
                                  className="h-9 rounded-lg bg-orange-500 px-3 text-xs font-semibold text-white"
                                >
                                  Odeslat
                                </button>
                              </div>
                              <div className="space-y-2">
                                {(commentsByPostId[String(p.id ?? '')] ?? []).map((c) => (
                                  <div key={c.id} className="rounded-lg bg-white px-2 py-1.5">
                                    <p className="text-xs font-semibold text-zinc-700">
                                      {c.user?.name || c.user?.email || 'Uživatel'}
                                    </p>
                                    <p className="text-sm text-zinc-800">{c.content}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </article>
                        );
                      })
                    )}
                  </div>
                  </main>
                  <aside className="col-span-3 hidden xl:block">
                    <div className="sticky top-[96px] rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-sm font-semibold text-zinc-800">Community tip</p>
                      <p className="mt-2 text-sm text-zinc-600">
                        Přidávejte krátké, užitečné příspěvky. Největší dosah mají posty s fotkou nebo videem.
                      </p>
                    </div>
                  </aside>
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
