'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestDeleteMyProperty,
  nestFetchMyListings,
  nestTopMyProperty,
  type NestMyListingRow,
} from '@/lib/nest-client';

export default function MojeInzeratyPage() {
  const { apiAccessToken, isAuthenticated, isLoading } = useAuth();
  const [items, setItems] = useState<NestMyListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
                      {item.listingType === 'SHORTS' ? 'Video inzerát' : 'Klasický inzerát'} •{' '}
                      {item.dashboardStatus}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold leading-snug text-zinc-900">{item.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-[#e85d00]">
                      {Number(item.price ?? 0).toLocaleString('cs-CZ')} {item.currency ?? 'Kč'}
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
                        Upravit
                      </Link>
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
                    </div>
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
