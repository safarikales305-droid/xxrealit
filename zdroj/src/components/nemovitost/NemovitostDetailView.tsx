'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { MessageSellerModal } from '@/components/messages/MessageSellerModal';
import { ShareButtons } from '@/components/share/ShareButtons';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestShareListingByEmail,
  nestSubmitOwnerLeadOffer,
  nestToggleFavorite,
} from '@/lib/nest-client';
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
  const shouldBlurGuestPrice = !isAuthenticated;
  const media = useMemo(() => buildMediaList(p), [p]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [sellerActionHint, setSellerActionHint] = useState<string | null>(null);
  const [liked, setLiked] = useState(Boolean(p.liked));
  const [likeBusy, setLikeBusy] = useState(false);
  const [ownerLeadOpen, setOwnerLeadOpen] = useState(false);
  const [ownerLeadText, setOwnerLeadText] = useState('');
  const [ownerLeadBusy, setOwnerLeadBusy] = useState(false);
  const [ownerLeadErr, setOwnerLeadErr] = useState<string | null>(null);
  const [shareEmailOpen, setShareEmailOpen] = useState(false);
  const [shareRecipientEmail, setShareRecipientEmail] = useState('');
  const [shareRecipientName, setShareRecipientName] = useState('');
  const [shareSenderName, setShareSenderName] = useState(user?.name ?? '');
  const [shareSenderEmail, setShareSenderEmail] = useState(user?.email ?? '');
  const [shareSenderMessage, setShareSenderMessage] = useState('');
  const [shareEmailBusy, setShareEmailBusy] = useState(false);
  const [shareEmailMsg, setShareEmailMsg] = useState<string | null>(null);
  const active = media[activeIndex] ?? media[0];

  useEffect(() => {
    setLiked(Boolean(p.liked));
  }, [p.id, p.liked]);

  useEffect(() => {
    setShareSenderName(user?.name ?? '');
    setShareSenderEmail(user?.email ?? '');
  }, [user?.email, user?.name]);

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

  const ownerId = String(p.userId ?? author.id ?? '').trim();
  const isOwner = Boolean(
    user?.id && ownerId && String(user.id).trim() === String(ownerId).trim(),
  );
  const isAgentViewer = user?.role === 'AGENT';
  const showOwnerBadges = Boolean(p.isOwnerListing);
  const directContactOk = p.directContactVisible === true;
  const phone = (p.contactPhone ?? '').trim();
  const email = (p.contactEmail ?? '').trim();
  const nameContact = (p.contactName ?? '').trim();
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
    if (isOwner) {
      setSellerActionHint('Toto je váš vlastní inzerát.');
      window.setTimeout(() => setSellerActionHint(null), 5000);
      return;
    }
    setSellerModalOpen(true);
  }

  async function handleOwnerLeadSubmit() {
    setOwnerLeadErr(null);
    if (!apiAccessToken) {
      redirectToLoginForMessages();
      return;
    }
    const t = ownerLeadText.trim();
    if (t.length < 10) {
      setOwnerLeadErr('Napište nabídku alespoň na 10 znaků.');
      return;
    }
    setOwnerLeadBusy(true);
    const r = await nestSubmitOwnerLeadOffer(apiAccessToken, propertyId, t);
    setOwnerLeadBusy(false);
    if (!r.ok) {
      setOwnerLeadErr(r.error ?? 'Odeslání se nezdařilo');
      return;
    }
    setOwnerLeadOpen(false);
    setOwnerLeadText('');
    router.push('/profil/zpravy');
  }

  function handleFavoriteClick() {
    if (!apiAccessToken) {
      redirectToLoginForMessages();
      return;
    }
    setLikeBusy(true);
    void nestToggleFavorite(propertyId, liked, apiAccessToken).then((r) => {
      setLikeBusy(false);
      if (r.ok && typeof r.favorited === 'boolean') setLiked(r.favorited);
    });
  }

  async function handleShareByEmail() {
    setShareEmailMsg(null);
    const recipientEmail = shareRecipientEmail.trim().toLowerCase();
    if (!recipientEmail) {
      setShareEmailMsg('Zadejte e-mail příjemce.');
      return;
    }
    setShareEmailBusy(true);
    const result = await nestShareListingByEmail({
      propertyId,
      recipientEmail,
      recipientName: shareRecipientName.trim() || undefined,
      senderName: shareSenderName.trim() || undefined,
      senderEmail: shareSenderEmail.trim() || undefined,
      senderMessage: shareSenderMessage.trim() || undefined,
    });
    setShareEmailBusy(false);
    setShareEmailMsg(result.ok ? result.message ?? 'E-mail byl odeslán.' : result.error ?? 'Odeslání selhalo.');
  }

  const favoriteBtnClass =
    'inline-flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-orange-300/90 bg-white text-orange-700 shadow-[0_6px_24px_rgba(0,0,0,0.08)] transition hover:border-orange-500 hover:bg-gradient-to-br hover:from-orange-50 hover:to-amber-50 hover:text-orange-800 active:scale-95 disabled:pointer-events-none disabled:opacity-45';

  const primaryMessageClass =
    'inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 border-orange-400/90 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3.5 text-base font-extrabold text-white shadow-[0_12px_36px_rgba(255,90,0,0.35)] transition hover:brightness-110 active:scale-[0.99] sm:text-lg';

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
              {showOwnerBadges ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                    Přímý vlastník
                  </span>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800">
                    Bez realitky
                  </span>
                  {p.ownerContactConsent ? (
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-900">
                      Souhlas s kontaktem makléřů
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="text-xl font-semibold text-orange-600">
                <span
                  className={
                    shouldBlurGuestPrice
                      ? 'select-none blur-[10px] opacity-70'
                      : undefined
                  }
                  aria-hidden={shouldBlurGuestPrice ? true : undefined}
                >
                  {PRICE_FMT.format(p.price)}
                </span>
              </div>
              <div className="text-sm text-zinc-500">{p.location}</div>
              {summaryLine ? (
                <div className="text-sm text-zinc-700">{summaryLine}</div>
              ) : null}

              <div className="rounded-2xl border-2 border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-amber-50/40 p-4 shadow-[0_8px_30px_rgba(234,88,0,0.12)] sm:p-5">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-orange-800/75">
                  Rychlé akce
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  <button type="button" onClick={handleWriteSeller} className={primaryMessageClass}>
                    <MessageCircle className="size-6 shrink-0" strokeWidth={2.25} aria-hidden />
                    Odeslat zprávu prodejci
                  </button>
                  {sellerActionHint ? (
                    <p className="text-sm font-medium text-amber-800" role="status">
                      {sellerActionHint}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={likeBusy}
                      onClick={handleFavoriteClick}
                      className={`${favoriteBtnClass} ${liked ? 'border-orange-500 bg-gradient-to-br from-[#ff6a00] to-[#ff3c00] text-white hover:text-white' : ''}`}
                      aria-label={liked ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
                    >
                      <Heart
                        className={`size-6 ${liked ? 'fill-white text-white' : ''}`}
                        strokeWidth={liked ? 0 : 2.25}
                      />
                    </button>
                    <ShareButtons
                      title={p.title}
                      url={shareUrl}
                      variant="lightRail"
                      label="Sdílet"
                    />
                    <button
                      type="button"
                      onClick={() => setShareEmailOpen(true)}
                      className="rounded-full border-2 border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-orange-400 hover:text-orange-700"
                    >
                      Sdílet e-mailem
                    </button>
                  </div>
                </div>
              </div>

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
                  (author.name?.trim().charAt(0) || 'U').toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900">{author.name?.trim() || 'Uživatel'}</p>
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
            {directContactOk && (phone || email) ? (
              <div className="mt-3 space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 text-sm text-zinc-800">
                {nameContact ? <p className="font-medium">{nameContact}</p> : null}
                {phone ? (
                  <p>
                    Tel.:{' '}
                    <a href={`tel:${phone}`} className="font-semibold text-orange-700 hover:underline">
                      {phone}
                    </a>
                  </p>
                ) : null}
                {email ? (
                  <p className="break-all">
                    E-mail:{' '}
                    <a href={`mailto:${email}`} className="font-semibold text-orange-700 hover:underline">
                      {email}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : p.isOwnerListing ? (
              <p className="mt-2 text-sm text-zinc-600">
                U tohoto inzerátu není veřejně zobrazen přímý kontakt. Použijte zprávu přes platformu
                nebo (jako makléř) nabídku služeb.
              </p>
            ) : null}
            <button type="button" onClick={handleWriteSeller} className={`${primaryMessageClass} mt-4`}>
              <MessageCircle className="size-5 shrink-0 sm:size-6" strokeWidth={2.25} aria-hidden />
              Odeslat zprávu prodejci
            </button>
            {p.isOwnerListing && isAgentViewer && !isOwner ? (
              <button
                type="button"
                onClick={() => {
                  setOwnerLeadErr(null);
                  setOwnerLeadOpen(true);
                }}
                className="mt-3 flex w-full min-h-[48px] items-center justify-center rounded-full border-2 border-zinc-300 bg-white px-4 py-3 text-sm font-bold text-zinc-800 shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
              >
                Nabídnout služby vlastníkovi
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
                      className="block rounded-xl border border-zinc-100 p-3 transition hover:border-orange-200 hover:bg-orange-50/40"
                    >
                      <p className="line-clamp-2 text-sm font-medium text-zinc-900">{item.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.location}</p>
                      <p className="mt-1 text-sm font-bold text-[#e85d00]">
                        <span
                          className={
                            shouldBlurGuestPrice
                              ? 'select-none blur-[10px] opacity-70'
                              : undefined
                          }
                          aria-hidden={shouldBlurGuestPrice ? true : undefined}
                        >
                          {PRICE_FMT.format(item.price)}
                        </span>
                      </p>
                      <span className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center rounded-full border-2 border-orange-400/90 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white shadow-md transition hover:brightness-110">
                        Zobrazit inzerát
                      </span>
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

      {ownerLeadOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-lead-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 id="owner-lead-title" className="text-lg font-semibold text-zinc-900">
              Nabídka služeb vlastníkovi
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Zpráva se odešle přes interní komunikaci. První oslovení může spotřebovat odměnový
              lead, pokud nemáte prémiový účet makléře.
            </p>
            <textarea
              value={ownerLeadText}
              onChange={(e) => setOwnerLeadText(e.target.value)}
              rows={5}
              className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15"
              placeholder="Stručně představte svou kancelář a nabídku…"
            />
            {ownerLeadErr ? (
              <p className="mt-2 text-sm font-medium text-red-600" role="alert">
                {ownerLeadErr}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setOwnerLeadOpen(false)}
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={ownerLeadBusy}
                onClick={() => void handleOwnerLeadSubmit()}
                className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
              >
                {ownerLeadBusy ? 'Odesílám…' : 'Odeslat nabídku'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareEmailOpen ? (
        <div
          className="fixed inset-0 z-[210] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">Sdílet inzerát e-mailem</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="email"
                value={shareRecipientEmail}
                onChange={(e) => setShareRecipientEmail(e.target.value)}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="E-mail příjemce *"
              />
              <input
                type="text"
                value={shareRecipientName}
                onChange={(e) => setShareRecipientName(e.target.value)}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Jméno příjemce (volitelné)"
              />
              <input
                type="text"
                value={shareSenderName}
                onChange={(e) => setShareSenderName(e.target.value)}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Vaše jméno (volitelné)"
              />
              <input
                type="email"
                value={shareSenderEmail}
                onChange={(e) => setShareSenderEmail(e.target.value)}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Váš e-mail (volitelné)"
              />
            </div>
            <textarea
              value={shareSenderMessage}
              onChange={(e) => setShareSenderMessage(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Osobní zpráva (volitelné)"
            />
            {shareEmailMsg ? <p className="mt-3 text-sm text-zinc-700">{shareEmailMsg}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareEmailOpen(false)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
              >
                Zavřít
              </button>
              <button
                type="button"
                disabled={shareEmailBusy}
                onClick={() => void handleShareByEmail()}
                className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {shareEmailBusy ? 'Odesílám…' : 'Odeslat'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
