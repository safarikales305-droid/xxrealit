'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestApiConfigured, nestToggleFavorite } from '@/lib/nest-client';
import type { PropertyFeedItem } from '@/types/property';

const PRICE_FMT = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

type Props = {
  properties: PropertyFeedItem[];
};

export function PropertyGrid({ properties }: Props) {
  const { apiAccessToken, isAuthenticated } = useAuth();
  const canFavorite = nestApiConfigured() && isAuthenticated && Boolean(apiAccessToken);

  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialLiked = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const p of properties) {
      m[p.id] = Boolean(p.liked);
    }
    return m;
  }, [properties]);

  useEffect(() => {
    setLikedMap((prev) => {
      const next = { ...initialLiked };
      for (const id of Object.keys(prev)) {
        if (id in next) next[id] = prev[id];
      }
      return next;
    });
  }, [initialLiked]);

  const toggleHeart = useCallback(
    async (p: PropertyFeedItem) => {
      if (!canFavorite || !apiAccessToken) {
        setError('Přihlaste se a nastavte Nest API (NEXT_PUBLIC_API_URL).');
        return;
      }
      const current = likedMap[p.id] ?? Boolean(p.liked);
      setPendingId(p.id);
      setError(null);
      const res = await nestToggleFavorite(p.id, current, apiAccessToken);
      setPendingId(null);
      if (!res.ok) {
        setError(res.error ?? 'Oblíbené se nepodařilo uložit');
        return;
      }
      const nextLiked = res.favorited ?? !current;
      setLikedMap((m) => ({ ...m, [p.id]: nextLiked }));
    },
    [apiAccessToken, canFavorite, likedMap],
  );

  if (properties.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-lg font-semibold text-zinc-700">Žádné výsledky</p>
        <p className="mt-2 max-w-sm text-sm text-zinc-500">
          Zkuste upravit hledání nebo filtry.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full pb-4">
      {error ? (
        <p className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {properties.map((p) => {
          const liked = likedMap[p.id] ?? Boolean(p.liked);
          const media = Array.isArray(p.media) ? [...p.media].sort((a, b) => a.order - b.order) : [];
          const primaryImage = media.find((m) => m.type === 'image')?.url ?? p.imageUrl ?? p.images?.[0] ?? null;
          const primaryVideo = media.find((m) => m.type === 'video')?.url ?? p.videoUrl ?? null;
          console.log('POST MEDIA:', p.media);
          console.log('POST IMAGE:', p.imageUrl);
          return (
            <article
              key={p.id + (p.videoUrl ?? '') + (p.imageUrl ?? '')}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-sm transition duration-300 hover:border-zinc-300 hover:shadow-md"
            >
              <Link href={`/nemovitost/${p.id}`} className="block flex flex-1 flex-col">
                <div className="relative aspect-[4/3] bg-zinc-100">
                  {primaryImage ? (
                    <img
                      src={nestAbsoluteAssetUrl(primaryImage)}
                      alt={p.title}
                      className="h-full w-full object-cover"
                    />
                  ) : primaryVideo ? (
                    <video
                      muted
                      playsInline
                      autoPlay
                      loop
                      controls
                      preload="metadata"
                      className="h-full w-full object-cover"
                      src={nestAbsoluteAssetUrl(primaryVideo)}
                      onError={() => console.error('VIDEO ERROR', primaryVideo)}
                      aria-hidden
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-sm text-zinc-400">
                      Bez náhledu
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-zinc-900">
                    {p.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] text-zinc-500">{p.location}</p>
                  <p className="mt-auto pt-3 text-lg font-bold tabular-nums text-[#e85d00]">
                    {PRICE_FMT.format(p.price)}
                  </p>
                </div>
              </Link>
              {canFavorite ? (
                <button
                  type="button"
                  aria-label={liked ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
                  disabled={pendingId === p.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void toggleHeart(p);
                  }}
                  className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full bg-white/95 text-lg shadow-md backdrop-blur-sm transition hover:scale-105 disabled:opacity-50"
                >
                  {liked ? '❤️' : '🤍'}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
