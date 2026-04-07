'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL, nestAbsoluteAssetUrl } from '@/lib/api';
import { nestCreateVideoPost, type ShortVideo } from '@/lib/nest-client';
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

/**
 * Light shell + Shorts (TikTok) / Classic (Sreality-style grid).
 */
export function HomeLayout({
  items,
  ShortsFeed,
  apiConfigMissing = false,
}: Props) {
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
  const [creatingPost, setCreatingPost] = useState(false);
  const [postVideo, setPostVideo] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [postVideoError, setPostVideoError] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [detailPost, setDetailPost] = useState<Record<string, unknown> | null>(null);
  const postVideoInputRef = useRef<HTMLInputElement | null>(null);
  const postTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const storyPosts = useMemo(
    () =>
      postFeed.filter((p) => {
        const url = String(p.videoUrl ?? '').trim();
        if (!url) return false;
        const t = String(p.type ?? '');
        return t === 'post' || t === 'video' || t === 'text';
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

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPostVideoError(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setPostVideo(null);
      return;
    }
    if (!file.type.startsWith('video/')) {
      setPostVideoError('Povolené jsou pouze video soubory.');
      e.target.value = '';
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      alert('Video bude komprimováno');
      setPostVideoError('Maximální velikost nahrání je 60 MB.');
      e.target.value = '';
      return;
    }
    setPostVideo(file);
  }

  function handlePostContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setPostContent(value);
  }

  async function refreshPostsFeed() {
    if (!API_BASE_URL) return;
    const res = await fetch(`${API_BASE_URL}/feed/posts`, { cache: 'no-store' });
    const data = (await res.json().catch(() => [])) as unknown;
    setPostFeed(Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []);
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
    if (!API_BASE_URL) return;
    const endpoint =
      viewMode === 'shorts'
        ? '/feed/shorts'
        : viewMode === 'posts'
          ? '/feed/posts'
          : null;
    if (!endpoint) return;

    setLoadingFeed(true);
    void fetch(`${API_BASE_URL}${endpoint}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? (data as ShortVideo[]) : [];
        if (viewMode === 'shorts') setVideoFeed(list);
        if (viewMode === 'posts') setPostFeed(list);
      })
      .catch(() => {
        if (viewMode === 'shorts') setVideoFeed([]);
        if (viewMode === 'posts') setPostFeed([]);
      })
      .finally(() => setLoadingFeed(false));
  }, [viewMode]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();

    if (!API_BASE_URL || !user || !apiAccessToken) return;

    const text = postContent.trim();
    if (!postVideo && !text) return;

    setPostVideoError(null);
    setCreatingPost(true);
    try {
      const postsBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
      if (postVideo) {
        const r = await nestCreateVideoPost(apiAccessToken, postVideo, text);
        if (!r.success) {
          alert('Upload selhal');
          setPostVideoError(r.error ?? 'Upload videa selhal.');
          return;
        }
        if (!r.url) {
          alert('Upload selhal');
          setPostVideoError('Upload videa selhal.');
          return;
        }
        setPostVideo(null);
        setPostContent('');
        if (postVideoInputRef.current) {
          postVideoInputRef.current.value = '';
        }
      } else {
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
    <div className="flex h-screen w-full flex-col overflow-hidden overflow-x-hidden bg-[#fafafa] text-zinc-900">
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
        onMobileFiltersOpen={() => setMobileFiltersOpen(true)}
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
        className="mx-auto grid min-h-0 w-full min-w-0 max-w-[100rem] flex-1 grid-cols-1 gap-4 overflow-hidden overflow-x-hidden p-2 md:grid-cols-[260px_1fr] md:p-4 xl:grid-cols-[260px_1fr_300px]"
      >
        <div className="hidden min-h-0 min-w-0 shrink-0 overflow-x-hidden md:block">
          <SidebarFilters className="mt-0 w-full max-w-full flex-col md:mt-2 md:mb-2 lg:mt-4 lg:mb-4" />
        </div>

        <main
          className={
            !hasData && viewMode === 'classic'
              ? 'relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)] md:min-w-0'
              : viewMode === 'shorts'
                ? 'relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden rounded-2xl bg-black shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)] md:min-w-0 lg:ring-1 lg:ring-black/10'
                : 'relative flex min-h-0 min-w-0 flex-col overflow-y-auto overflow-x-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_24px_-8px_rgba(0,0,0,0.06)] md:min-w-0'
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
              className="flex min-h-0 flex-1 flex-col overflow-hidden [animation:view-fade-in_0.35s_ease-out]"
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
                <div className="mx-auto h-full max-w-2xl overflow-y-auto p-3 pb-8 md:p-6 lg:max-w-3xl">
                  {isAuthenticated ? (
                    <form
                      onSubmit={(e) => void handleSubmit(e)}
                      className="mb-6 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm"
                    >
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
                        className="w-full resize-none overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/15"
                      />
                      <input
                        ref={postVideoInputRef}
                        type="file"
                        accept="video/*"
                        className="sr-only"
                        aria-label="Vybrat video"
                        onChange={handleVideoChange}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {postVideo ? (
                          <>
                            <span className="max-w-[min(100%,14rem)] truncate text-xs text-zinc-500">
                              {postVideo.name}
                            </span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-red-600 hover:underline"
                              onClick={() => {
                                setPostVideo(null);
                                setPostVideoError(null);
                                if (postVideoInputRef.current) {
                                  postVideoInputRef.current.value = '';
                                }
                              }}
                            >
                              Odebrat
                            </button>
                          </>
                        ) : null}
                      </div>
                      {postVideoError ? (
                        <p className="mt-2 text-sm font-medium text-red-600" role="alert">
                          {postVideoError}
                        </p>
                      ) : null}
                      {videoPreviewUrl ? (
                        <video
                          muted
                          playsInline
                          autoPlay
                          loop
                          controls
                          preload="metadata"
                          className="mt-3 h-36 w-full max-w-xs rounded-2xl object-cover"
                          src={videoPreviewUrl}
                        />
                      ) : null}
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => postVideoInputRef.current?.click()}
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-lg text-orange-600 transition hover:bg-orange-50"
                          title="Přidat video"
                          aria-label="Přidat video"
                        >
                          🎬
                        </button>
                        <button
                          type="submit"
                          disabled={creatingPost || (!postVideo && !postContent.trim())}
                          className="h-9 shrink-0 rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
                        >
                          {creatingPost
                            ? postVideo
                              ? 'Nahrávám…'
                              : 'Odesílám…'
                            : 'Přidat'}
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {storyPosts.length > 0 ? (
                    <div className="mb-6">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Příběhy
                      </p>
                      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
                        {storyPosts.map((p) => {
                          const src = nestAbsoluteAssetUrl(String(p.videoUrl ?? ''));
                          if (!src) return null;
                          return (
                            <button
                              key={String(p.id)}
                              type="button"
                              onClick={() => setDetailPost(p)}
                              className="shrink-0 overflow-hidden rounded-2xl ring-2 ring-orange-500/25 ring-offset-2 transition hover:ring-orange-500/60"
                            >
                              <video
                                muted
                                playsInline
                                preload="metadata"
                                className="pointer-events-none size-20 object-cover sm:size-24"
                                src={src}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-4">
                    {loadingFeed ? (
                      <p className="text-sm text-zinc-600">Načítám příspěvky…</p>
                    ) : postFeed.length === 0 ? (
                      <p className="text-sm text-zinc-600">Zatím žádné příspěvky.</p>
                    ) : (
                      postFeed.map((p) => (
                        <article
                          key={String(p.id ?? Math.random())}
                          className="relative rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm"
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
                          <p className="text-xs font-medium text-zinc-500">
                            {String(
                              ((p.user as { name?: string } | undefined)?.name ??
                                (p.user as { email?: string } | undefined)?.email ??
                                'Autor'),
                            )}
                          </p>
                          {editingPostId === String(p.id ?? '') ? (
                            <div className="mt-2">
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
                          ) : (
                            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
                              {String(p.description ?? p.content ?? '')}
                            </p>
                          )}
                          {String(p.videoUrl ?? '').trim() ? (
                            <button
                              type="button"
                              className="mt-3 block w-full text-left"
                              onClick={() => setDetailPost(p)}
                            >
                              <video
                                src={nestAbsoluteAssetUrl(String(p.videoUrl ?? ''))}
                                playsInline
                                controls
                                preload="metadata"
                                className="aspect-video w-full rounded-2xl bg-black object-cover"
                              />
                            </button>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>

                  {detailPost ? (
                    <div
                      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Detail videa"
                    >
                      <button
                        type="button"
                        className="absolute right-4 top-4 z-[101] rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-zinc-800 shadow"
                        onClick={() => setDetailPost(null)}
                      >
                        Zavřít
                      </button>
                      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-3 shadow-2xl">
                        <video
                          src={nestAbsoluteAssetUrl(String(detailPost.videoUrl ?? ''))}
                          controls
                          autoPlay
                          playsInline
                          preload="metadata"
                          className="w-full rounded-2xl"
                        />
                        <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">
                          {String(detailPost.description ?? detailPost.content ?? '')}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <PropertyGrid properties={filteredItems} />
              )}
            </div>
          )}
        </main>

        <div className="hidden min-h-0 min-w-0 shrink-0 overflow-x-hidden xl:block">
          <RightSidebar className="mt-4 mb-4 w-full max-w-full flex-col" />
        </div>
      </div>
    </div>
  );
}
