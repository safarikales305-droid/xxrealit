'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { NemovitostBackBar } from '@/components/nemovitost/NemovitostBackBar';
import { NemovitostShareBar } from '@/components/nemovitost/NemovitostShareBar';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { PropertyDetailAuthor } from '@/lib/property-detail';
import type { PropertyFeedItem } from '@/types/property';

const PRICE_FMT = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

type MediaItem = {
  key: string;
  url: string;
  type: 'image' | 'video';
};

type Props = {
  propertyId: string;
  property: PropertyFeedItem;
  author: PropertyDetailAuthor;
  other: PropertyFeedItem[];
  extraFields?: Record<string, unknown>;
};

function buildMediaList(p: PropertyFeedItem): MediaItem[] {
  const fromRelation = [...(p.media ?? [])]
    .filter((m) => m.url?.trim())
    .sort((a, b) => a.order - b.order)
    .map((m, i) => ({
      key: `${m.type}-${m.order}-${i}`,
      url: m.url,
      type: m.type,
    }));
  if (fromRelation.length > 0) return fromRelation;
  const v = p.videoUrl?.trim();
  if (v) {
    return [{ key: 'video-fallback', url: v, type: 'video' }];
  }
  const img = p.imageUrl?.trim() ?? p.images?.[0]?.trim();
  if (img) {
    return [{ key: 'image-fallback', url: img, type: 'image' }];
  }
  return [];
}

function formatExtra(label: string, v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return `${label}: ${v}`;
  if (typeof v === 'string') return `${label}: ${v}`;
  if (typeof v === 'boolean') return `${label}: ${v ? 'Ano' : 'Ne'}`;
  return null;
}

export function NemovitostDetailView({
  propertyId,
  property: p,
  author,
  other,
  extraFields = {},
}: Props) {
  const router = useRouter();
  const media = useMemo(() => buildMediaList(p), [p]);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = media[activeIndex] ?? media[0];

  const paramLines = useMemo(() => {
    const lines: string[] = [];
    const ex = (k: string, label: string) => {
      const t = formatExtra(label, extraFields[k]);
      if (t) lines.push(t);
    };
    ex('area', 'Plocha (m²)');
    ex('landArea', 'Plocha pozemku');
    ex('floor', 'Patro');
    ex('totalFloors', 'Počet podlaží');
    ex('propertyType', 'Typ nemovitosti');
    ex('offerType', 'Typ nabídky');
    ex('condition', 'Stav');
    ex('energyLabel', 'Energetický štítek');
    return lines;
  }, [extraFields]);

  const avatarSrc =
    author.avatar && author.avatar.trim().length > 0
      ? nestAbsoluteAssetUrl(author.avatar)
      : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <aside className="hidden space-y-4 xl:col-span-3 xl:block">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">Makléři a partneři</p>
            <p className="mt-2 text-sm text-zinc-600">
              Prostor pro doporučené makléřské služby a reklamu.
            </p>
          </div>
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">Stavební firmy</p>
            <p className="mt-2 text-sm text-zinc-600">
              Tipy na ověřené dodavatele a rekonstrukce.
            </p>
          </div>
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">Rady při koupi</p>
            <p className="mt-2 text-sm text-zinc-600">
              Kontrola LV, hypotéka, předání nemovitosti.
            </p>
          </div>
        </aside>

        <main className="min-w-0 xl:col-span-6">
          <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 p-4 sm:p-6">
              <Suspense fallback={null}>
                <NemovitostBackBar />
              </Suspense>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                >
                  ← Zpět na výpis
                </button>
                <NemovitostShareBar propertyId={propertyId} title={p.title} />
              </div>
              <p className="mt-4 text-sm font-medium text-zinc-500">Detail inzerátu</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
                {p.title}
              </h1>
              <p className="mt-4 text-2xl font-bold text-[#e85d00]">{PRICE_FMT.format(p.price)}</p>
              <p className="mt-2 text-[15px] font-medium text-zinc-700">
                <span className="text-zinc-500">Lokalita:</span> {p.location}
              </p>
            </div>

            {media.length > 0 && active ? (
              <div className="border-b border-zinc-100 bg-black">
                <div className="flex min-h-[200px] items-center justify-center">
                  {active.type === 'video' ? (
                    <video
                      key={active.key}
                      src={nestAbsoluteAssetUrl(active.url)}
                      controls
                      playsInline
                      className="max-h-[80vh] w-full bg-black object-contain"
                    />
                  ) : (
                    <img
                      src={nestAbsoluteAssetUrl(active.url)}
                      alt={p.title}
                      className="max-h-[80vh] w-full bg-black object-contain"
                    />
                  )}
                </div>
                {media.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto p-3">
                    {media.map((item, index) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                          index === activeIndex
                            ? 'border-[#e85d00] ring-2 ring-[#e85d00]/20'
                            : 'border-zinc-600'
                        }`}
                      >
                        {item.type === 'video' ? (
                          <video
                            src={nestAbsoluteAssetUrl(item.url)}
                            muted
                            playsInline
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <img
                            src={nestAbsoluteAssetUrl(item.url)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center border-b border-zinc-100 bg-zinc-100 text-sm text-zinc-500">
                Bez náhledu
              </div>
            )}

            <div className="p-6 sm:p-8">
              {p.description ? (
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Popis</h2>
                  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
                    {p.description}
                  </p>
                </div>
              ) : null}

              {paramLines.length > 0 ? (
                <div className={p.description ? 'mt-8' : ''}>
                  <h2 className="text-lg font-semibold text-zinc-900">Parametry</h2>
                  <ul className="mt-3 space-y-2 text-[15px] text-zinc-700">
                    {paramLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-10 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Inzerent</h2>
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-xl font-bold text-zinc-600">
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt=""
                        width={64}
                        height={64}
                        className="size-full object-cover"
                      />
                    ) : (
                      author.email.trim().charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    {author.name ? (
                      <p className="font-semibold text-zinc-900">{author.name}</p>
                    ) : null}
                    <p className="truncate text-sm text-zinc-600">{author.email}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="hidden space-y-4 xl:col-span-3 xl:block">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">Kontakt a návštěva</p>
            <p className="mt-2 text-sm text-zinc-600">
              Domluvte si prohlídku nebo doplňující informace u inzerenta.
            </p>
          </div>
          {other.length > 0 ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">Další od stejného uživatele</p>
              <ul className="mt-3 space-y-3">
                {other.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/nemovitost/${item.id}`}
                      className="block rounded-xl border border-zinc-100 p-3 transition hover:border-zinc-200 hover:bg-zinc-50"
                    >
                      <p className="line-clamp-2 text-sm font-medium text-zinc-900">{item.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.location}</p>
                      <p className="mt-1 text-sm font-bold text-[#e85d00]">
                        {PRICE_FMT.format(item.price)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">Podobné nabídky</p>
              <p className="mt-2 text-sm text-zinc-600">Brzy doplníme doporučené inzeráty.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
