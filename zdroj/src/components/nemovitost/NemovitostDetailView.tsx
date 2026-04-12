'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MessageSellerModal } from '@/components/messages/MessageSellerModal';
import { ShareButtons } from '@/components/share/ShareButtons';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { absoluteShareUrl } from '@/lib/public-share-url';
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
  const { user, isAuthenticated, apiAccessToken } = useAuth();
  const media = useMemo(() => buildMediaList(p), [p]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
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

  const shareUrl = absoluteShareUrl(`/nemovitost/${encodeURIComponent(propertyId)}`);

  const ownerId = String(p.userId ?? author.id).trim();
  const isOwner = Boolean(user?.id && ownerId && user.id === ownerId);
  const canContactSeller = Boolean(ownerId) && !isOwner;
  const coverForMessage =
    media.find((m) => m.type === 'image')?.url?.trim() ||
    p.imageUrl?.trim() ||
    p.images?.find((u) => u.trim()) ||
    null;

  const summaryLine = useMemo(() => {
    const parts: string[] = [];
    const pt = extraFields.propertyType;
    const ar = extraFields.area;
    if (typeof pt === 'string' && pt.trim()) parts.push(pt.trim());
    if (typeof ar === 'number' && Number.isFinite(ar)) parts.push(`${ar} m²`);
    else if (typeof ar === 'string' && ar.trim()) parts.push(`${ar} m²`);
    return parts.join(' • ');
  }, [extraFields.area, extraFields.propertyType]);

  function redirectToLoginForMessages() {
    const path = `/nemovitost/${encodeURIComponent(propertyId)}`;
    router.push(`/prihlaseni?redirect=${encodeURIComponent(path)}`);
  }

  function handleWriteSeller() {
    if (!isAuthenticated || !apiAccessToken) {
      redirectToLoginForMessages();
      return;
    }
    setSellerModalOpen(true);
  }

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
          <button
            type="button"
            onClick={() => router.push('/?tab=shorts')}
            className="mb-4 inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
          >
            ← Zpět na Shorts
          </button>

          {media.length > 0 && active ? (
            <div className="overflow-hidden rounded-2xl bg-black">
              <div className="flex min-h-[200px] items-center justify-center">
                {active.type === 'video' ? (
                  <video
                    key={active.key}
                    src={nestAbsoluteAssetUrl(active.url)}
                    controls
                    playsInline
                    className="h-auto max-h-[80vh] w-full rounded-2xl bg-black object-contain"
                  />
                ) : (
                  <img
                    src={nestAbsoluteAssetUrl(active.url)}
                    alt={p.title}
                    className="h-auto max-h-[80vh] w-full rounded-2xl bg-black object-contain"
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
            <div className="flex min-h-[200px] items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500">
              Bez náhledu
            </div>
          )}

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="space-y-3">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{p.title}</h1>
              <div className="text-xl font-semibold text-orange-600">
                {PRICE_FMT.format(p.price)}
              </div>
              <div className="text-sm text-zinc-500">{p.location}</div>
              {summaryLine ? (
                <div className="text-sm text-zinc-700">{summaryLine}</div>
              ) : null}
              {paramLines.length > 0 ? (
                <ul className="space-y-1 text-sm text-zinc-700">
                  {paramLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {p.description ? (
                <div className="text-base leading-7 text-zinc-800">
                  <p className="whitespace-pre-wrap">{p.description}</p>
                </div>
              ) : null}
              <div className="flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
                <ShareButtons title={p.title} url={shareUrl} variant="pill" label="Sdílet" />
                {canContactSeller ? (
                  <button
                    type="button"
                    onClick={handleWriteSeller}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                  >
                    Napsat prodejci
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
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
        </main>

        <aside className="hidden space-y-4 xl:col-span-3 xl:block">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">Kontakt a návštěva</p>
            <p className="mt-2 text-sm text-zinc-600">
              Domluvte si prohlídku nebo doplňující informace u inzerenta.
            </p>
            {canContactSeller ? (
              <button
                type="button"
                onClick={handleWriteSeller}
                className="mt-4 w-full rounded-full border border-orange-200 bg-orange-50 py-2.5 text-sm font-semibold text-orange-900 transition hover:bg-orange-100"
              >
                Napsat prodejci
              </button>
            ) : null}
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

      {canContactSeller ? (
        <MessageSellerModal
          open={sellerModalOpen}
          onClose={() => setSellerModalOpen(false)}
          propertyId={propertyId}
          listingTitle={p.title}
          price={p.price}
          location={p.location}
          coverImageUrl={coverForMessage}
          token={apiAccessToken}
          onSent={(conversationId) => {
            router.push(`/profil/zpravy/${conversationId}`);
          }}
        />
      ) : null}
    </div>
  );
}
