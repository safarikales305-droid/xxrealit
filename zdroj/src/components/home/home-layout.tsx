'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL, nestAbsoluteAssetUrl } from '@/lib/api';
import { nestCreateVideoPost } from '@/lib/nest-client';
import { PropertyGrid } from '@/components/property-grid';
import type { PropertyFeedItem } from '@/types/property';
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
  const [videoFeed, setVideoFeed] = useState<Array<Record<string, unknown>>>([]);
  const [postFeed, setPostFeed] = useState<Array<Record<string, unknown>>>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [creatingPost, setCreatingPost] = useState(false);
  const [postVideo, setPostVideo] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [postVideoError, setPostVideoError] = useState<string | null>(null);
  const postVideoInputRef = useRef<HTMLInputElement | null>(null);

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
    if (file.size > 50 * 1024 * 1024) {
      setPostVideoError('Maximální velikost videa je 50 MB.');
      e.target.value = '';
      return;
    }
    setPostVideo(file);
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
        const list = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
        if (viewMode === 'shorts') setVideoFeed(list);
        if (viewMode === 'posts') setPostFeed(list);
      })
      .catch(() => {
        if (viewMode === 'shorts') setVideoFeed([]);
        if (viewMode === 'posts') setPostFeed([]);
      })
      .finally(() => setLoadingFeed(false));
  }, [viewMode]);

  async function createPost() {
    if (!API_BASE_URL || !user || !apiAccessToken) return;

    const text = postContent.trim();
    if (!postVideo && !text) return;

    setPostVideoError(null);
    setCreatingPost(true);
    try {
      if (postVideo) {
        const r = await nestCreateVideoPost(apiAccessToken, postVideo, text);
        if (!r.ok) {
          setPostVideoError(r.error ?? 'Upload videa selhal.');
          return;
        }
        setPostVideo(null);
        setPostContent('');
        if (postVideoInputRef.current) {
          postVideoInputRef.current.value = '';
        }
      } else {
        await fetch(`${API_BASE_URL}/posts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiAccessToken}`,
          },
          body: JSON.stringify({ content: text }),
        });
        setPostContent('');
      }

      setViewMode('posts');
      const res = await fetch(`${API_BASE_URL}/feed/posts`, { cache: 'no-store' });
      const data = (await res.json().catch(() => [])) as unknown;
      setPostFeed(Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []);
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
                  <div className="h-full min-h-0 w-full snap-y snap-mandatory overflow-y-auto">
                    {videoFeed.map((v) => (
                      <section
                        key={String(v.id ?? Math.random())}
                        className="relative h-screen w-full snap-start bg-black"
                      >
                        <video
                          className="h-screen w-full object-cover"
                          controls
                          src={nestAbsoluteAssetUrl(
                            String((v.videoUrl as string | undefined) ?? v.url ?? ''),
                          )}
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                          <p className="text-sm font-semibold">
                            {String(
                              ((v.user as { name?: string } | undefined)?.name ??
                                (v.user as { email?: string } | undefined)?.email ??
                                'Autor'),
                            )}
                          </p>
                          <p className="mt-1 text-sm opacity-90">
                            {String(v.description ?? v.content ?? '')}
                          </p>
                        </div>
                      </section>
                    ))}
                  </div>
                )
              ) : viewMode === 'posts' ? (
                <div className="h-full overflow-y-auto p-3 md:p-4">
                  {isAuthenticated ? (
                    <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-3">
                      <textarea
                        value={postContent}
                        onChange={(e) => setPostContent(e.target.value)}
                        placeholder="Napište příspěvek nebo popište video..."
                        className="min-h-24 w-full rounded border border-zinc-300 p-2 text-sm"
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
                        <button
                          type="button"
                          onClick={() => postVideoInputRef.current?.click()}
                          className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Nahrát video
                        </button>
                        {postVideo ? (
                          <>
                            <span className="max-w-[min(100%,12rem)] truncate text-xs text-zinc-600">
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
                          src={videoPreviewUrl}
                          className="mt-3 w-40 max-w-full rounded"
                          controls
                          playsInline
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void createPost()}
                        disabled={creatingPost || (!postVideo && !postContent.trim())}
                        className="mt-3 rounded bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {creatingPost
                          ? postVideo
                            ? 'Nahrávám...'
                            : 'Odesílám...'
                          : 'Přidat příspěvek'}
                      </button>
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    {loadingFeed ? (
                      <p className="text-sm text-zinc-600">Načítám příspěvky...</p>
                    ) : postFeed.length === 0 ? (
                      <p className="text-sm text-zinc-600">Zatím žádné příspěvky.</p>
                    ) : (
                      postFeed.map((p) => (
                        <article
                          key={String(p.id ?? Math.random())}
                          className="rounded-xl border border-zinc-200 bg-white p-3"
                        >
                          <p className="text-xs text-zinc-500">
                            {String(
                              ((p.user as { name?: string } | undefined)?.name ??
                                (p.user as { email?: string } | undefined)?.email ??
                                'Autor'),
                            )}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
                            {String(p.description ?? p.content ?? '')}
                          </p>
                          {p.type === 'video' ? (
                            <video
                              controls
                              className="mt-3 aspect-[9/16] w-full rounded object-cover"
                              src={nestAbsoluteAssetUrl(String(p.videoUrl ?? ''))}
                            />
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
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
