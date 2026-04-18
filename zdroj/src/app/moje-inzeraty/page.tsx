'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { formatListingPrice } from '@/lib/price';
import {
  nestCreateShortsFromClassic,
  nestDeleteMyProperty,
  nestFetchMyListings,
  nestPostShortsRegenerate,
  nestTopMyProperty,
  type NestMyListingRow,
} from '@/lib/nest-client';

export default function MojeInzeratyPage() {
  const router = useRouter();
  const { apiAccessToken, isAuthenticated, isLoading } = useAuth();
  const [items, setItems] = useState<NestMyListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shortsCreatingId, setShortsCreatingId] = useState<string | null>(null);
  const [shortsRegeneratingId, setShortsRegeneratingId] = useState<string | null>(null);

  const hasAuth = Boolean(isAuthenticated && apiAccessToken);

  async function loadMyListings() {
    if (!apiAccessToken) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const rows = await nestFetchMyListings(apiAccessToken);
    setLoading(false);
    if (!rows) {
      setError('Nepodařilo se načíst vlastní inzeráty.');
      return;
    }
    setItems(rows);
  }

  useEffect(() => {
    void loadMyListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiAccessToken]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [items],
  );

  async function handleDelete(id: string) {
    if (!apiAccessToken) return;
    if (!window.confirm('Opravdu chcete tento inzerát smazat?')) return;
    setBusyId(id);
    const res = await nestDeleteMyProperty(apiAccessToken, id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? 'Smazání inzerátu selhalo.');
      return;
    }
    await loadMyListings();
  }

  async function handleTop(id: string) {
    if (!apiAccessToken) return;
    setBusyId(id);
    const res = await nestTopMyProperty(apiAccessToken, id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? 'Topování inzerátu selhalo.');
      return;
    }
    await loadMyListings();
  }

  async function handleRegenerateShorts(shortsListingId: string) {
    if (!apiAccessToken) return;
    setShortsRegeneratingId(shortsListingId);
    setError(null);
    const res = await nestPostShortsRegenerate(apiAccessToken, shortsListingId);
    setShortsRegeneratingId(null);
    if (!res.ok) {
      setError(res.error ?? 'Přegenerování shorts selhalo.');
      return;
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-12 text-zinc-900">
      <div className="mx-auto w-full max-w-6xl px-0 sm:px-4">
        <section className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur sm:rounded-b-2xl sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Správa inzerátů</h1>
              <p className="mt-0.5 text-xs text-zinc-600 sm:text-sm">
                Zobrazují se jen vaše vlastní inzeráty.
              </p>
            </div>
            <Link
              href="/inzerat/pridat"
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              Přidat inzerát
            </Link>
          </div>
        </section>

        {!isLoading && !hasAuth ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-600">
            Pro správu inzerátů se přihlaste.
          </div>
        ) : null}

        {error ? <p className="px-4 pt-4 text-sm font-medium text-red-600">{error}</p> : null}

        {loading ? (
          <p className="px-4 py-8 text-sm text-zinc-600">Načítám vaše inzeráty…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 px-0 py-4 md:grid-cols-2 md:px-2">
            {sortedItems.map((item) => {
              const cover = nestAbsoluteAssetUrl(item.coverUrl ?? '');
              const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(cover);
              const isShorts = item.listingType === 'SHORTS';
              const hasDraft = Boolean(item.shortsDraft?.id);
              const hasVariant = Boolean(item.shortsVariant?.id);
              const relatedShortsListingId = item.shortsListingId ?? item.shortsDraft?.id ?? null;
              return (
                <article key={item.id} className="overflow-hidden border-y border-zinc-200 bg-white shadow-sm sm:rounded-2xl sm:border">
                  <div className="relative aspect-[16/9] w-full bg-zinc-100">
                    {cover ? (
                      isVideo ? (
                        <video
                          src={cover}
                          controls
                          muted
                          playsInline
                          preload="metadata"
                          className="size-full object-cover"
                        />
                      ) : (
                        <img src={cover} alt={item.title} className="size-full object-cover" />
                      )
                    ) : (
                      <div className="flex size-full items-center justify-center text-sm text-zinc-500">
                        Bez náhledu média
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {isShorts ? 'Shorts / video inzerát' : 'Klasický inzerát'} •{' '}
                      {item.dashboardStatus}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold leading-snug text-zinc-900">{item.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-[#e85d00]">
                      {formatListingPrice(item.price)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {item.city}
                      {item.region ? `, ${item.region}` : ''}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/inzerat/upravit/${encodeURIComponent(item.id)}`}
                        className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                      >
                        Upravit inzerát
                      </Link>
                      {relatedShortsListingId ? (
                        <Link
                          href={`/inzerat/shorts-editor/${encodeURIComponent(relatedShortsListingId)}`}
                          className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                        >
                          Editor shorts + hudba
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleTop(item.id)}
                        disabled={busyId === item.id}
                        className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        Topovat
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        disabled={busyId === item.id}
                        className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Smazat
                      </button>
                      {!isShorts ? (
                        <button
                          type="button"
                          disabled={!apiAccessToken || shortsCreatingId === item.id}
                          className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          onClick={() => {
                            if (!apiAccessToken) return;
                            const txt = hasDraft || hasVariant
                              ? 'Shorts už u tohoto inzerátu existuje. Chcete vytvořit nový shorts koncept z aktuálních dat?'
                              : 'Vytvořit nový shorts koncept z tohoto klasického inzerátu?';
                            if (!window.confirm(txt)) return;
                            setShortsCreatingId(item.id);
                            void nestCreateShortsFromClassic(apiAccessToken, item.id).then((r) => {
                              setShortsCreatingId(null);
                              if (!r.ok || !r.shortsListingId) {
                                setError(r.error ?? 'Nepodařilo se vytvořit shorts koncept.');
                                return;
                              }
                              router.push(`/inzerat/shorts-editor/${r.shortsListingId}`);
                            });
                          }}
                        >
                          {shortsCreatingId === item.id
                            ? 'Vytvářím…'
                            : hasDraft || hasVariant
                              ? 'Znovu vytvořit Shorts'
                              : 'Vytvořit Shorts'}
                        </button>
                      ) : null}
                      {relatedShortsListingId ? (
                        <button
                          type="button"
                          disabled={!apiAccessToken || shortsRegeneratingId === relatedShortsListingId}
                          onClick={() => {
                            if (!window.confirm('Přegenerovat shorts video z aktuálních fotek a hudby?')) return;
                            void handleRegenerateShorts(relatedShortsListingId);
                          }}
                          className="rounded-full border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {shortsRegeneratingId === relatedShortsListingId ? 'Generuji…' : 'Přegenerovat shorts video'}
                        </button>
                      ) : null}
                    </div>
                    {!isShorts ? (
                      <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2.5 text-xs">
                        {hasVariant ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-orange-950">Shorts už existuje</span>
                            <Link
                              href={`/inzerat/upravit/${item.shortsVariant?.id ?? ''}`}
                              className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-900 hover:bg-orange-50"
                            >
                              Upravit shorts
                            </Link>
                          </div>
                        ) : hasDraft ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-orange-950">Koncept shorts je připraven</span>
                            <Link
                              href={`/inzerat/shorts-editor/${item.shortsDraft?.id}`}
                              className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-900 hover:bg-orange-50"
                            >
                              Otevřít editor (fotky + hudba)
                            </Link>
                          </div>
                        ) : (
                          <>
                            <p className="text-zinc-700">
                              Převod klasického inzerátu na Shorts vytvoří koncept, kde upravíte fotky, video i hudbu.
                            </p>
                            <p className="mt-2 text-zinc-700">Použijte tlačítko „Vytvořit Shorts“ výše.</p>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && sortedItems.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-600">
            Zatím nemáte žádné inzeráty.{' '}
            <Link href="/inzerat/pridat" className="font-semibold text-[#e85d00] hover:underline">
              Přidat inzerát
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
