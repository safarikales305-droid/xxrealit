'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { ContactLeadModal } from '@/components/listing/ContactLeadModal';
import { MessageSellerModal } from '@/components/messages/MessageSellerModal';
import { ShareButtons } from '@/components/share/ShareButtons';
import { useAuth } from '@/hooks/use-auth';
import { getNestPublicOrigin, nestAbsoluteAssetUrl } from '@/lib/api';
import { isValidImageUrl, normalizeImageCandidate } from '@/lib/images';
import {
  nestListingUnlockContact,
  nestShareListingByEmail,
  nestSubmitOwnerLeadOffer,
  nestToggleFavorite,
} from '@/lib/nest-client';
import { listingShareUrl } from '@/lib/public-share-url';
import type { PropertyDetailAuthor } from '@/lib/property-detail';
import { ListingPriceDisplay } from '@/components/pricing/ListingPriceDisplay';
import { TipDetailBadge } from '@/components/listing/TipBadges';
import { isTipListing } from '@/lib/is-tip-listing';
import { listingDetailHref } from '@/lib/listing-detail-navigation';
import { ListingDetailBackButton } from '@/components/nemovitost/ListingDetailBackButton';
import { ListingDetailLeftSidebar } from '@/components/nemovitost/ListingDetailLeftSidebar';
import { WhatsAppContactButton } from '@/components/whatsapp/WhatsAppContactButton';
import { classicListingCoverUrl, type PropertyFeedItem } from '@/types/property';

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

function collectPhotoUrls(p: PropertyFeedItem): string[] {
  const ext = p as PropertyFeedItem & {
    photos?: Array<{ url?: string } | string>;
  };
  const base = getNestPublicOrigin() || undefined;
  if (!Array.isArray(ext.photos)) return [];
  const out: string[] = [];
  for (const x of ext.photos) {
    if (typeof x === 'string') {
      const u = x.trim();
      const n = normalizeImageCandidate(u, base);
      if (isValidImageUrl(n)) out.push(n!);
    } else if (x && typeof x === 'object') {
      const u = typeof x.url === 'string' ? x.url.trim() : '';
      const n = normalizeImageCandidate(u, base);
      if (isValidImageUrl(n)) out.push(n!);
    }
  }
  return out;
}

function collectImagesFieldUrls(p: PropertyFeedItem): string[] {
  const base = getNestPublicOrigin() || undefined;
  const candidates = [
    ...(Array.isArray(p.images) ? p.images : []),
    ...(Array.isArray(p.galleryImages) ? p.galleryImages : []),
    ...(typeof p.mainImage === 'string' && p.mainImage.trim() ? [p.mainImage.trim()] : []),
  ];
  if (candidates.length === 0) return [];
  const out: string[] = [];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const n = normalizeImageCandidate(raw.trim(), base);
    if (isValidImageUrl(n)) out.push(n!);
  }
  return out;
}

function buildMediaList(p: PropertyFeedItem): MediaItem[] {
  const base = getNestPublicOrigin() || undefined;
  const relation = [...(p.media ?? [])]
    .filter((m) => m.url?.trim())
    .sort((a, b) => a.order - b.order);

  const videos: MediaItem[] = relation
    .filter((m) => m.type === 'video')
    .map((m, i) => ({
      key: `video-${m.order}-${i}`,
      url: m.url.trim(),
      type: 'video' as const,
    }));

  const seenNorm = new Set<string>();
  const imagesOut: MediaItem[] = [];
  const pushImage = (rawUrl: string, keyPrefix: string) => {
    const n = normalizeImageCandidate(rawUrl.trim(), base);
    if (!isValidImageUrl(n) || !n) return;
    if (seenNorm.has(n)) return;
    seenNorm.add(n);
    imagesOut.push({
      key: `${keyPrefix}-${imagesOut.length}`,
      url: n,
      type: 'image',
    });
  };

  for (const m of relation) {
    if (m.type === 'image' && m.url?.trim()) pushImage(m.url, 'media');
  }
  for (const u of collectImagesFieldUrls(p)) pushImage(u, 'img');
  for (const u of collectPhotoUrls(p)) pushImage(u, 'photo');

  if (videos.length > 0 || imagesOut.length > 0) {
    return [...videos, ...imagesOut];
  }
  const v = p.videoUrl?.trim();
  if (v) {
    return [{ key: 'video-fallback', url: v, type: 'video' }];
  }
  const cover = classicListingCoverUrl(p);
  if (cover) {
    return [{ key: 'image-fallback', url: cover, type: 'image' }];
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [brokenMediaKeys, setBrokenMediaKeys] = useState<Record<string, boolean>>({});
  const safeMediaIndex = Math.min(
    activeIndex,
    Math.max(0, media.length > 0 ? media.length - 1 : 0),
  );
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
  const [contactLeadOpen, setContactLeadOpen] = useState(false);
  const [contactLeadBusy, setContactLeadBusy] = useState(false);
  const [contactLeadError, setContactLeadError] = useState<string | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [contactSuccessMsg, setContactSuccessMsg] = useState<string | null>(null);
  const [interestSubmitted, setInterestSubmitted] = useState(false);
  const [unlockedContact, setUnlockedContact] = useState<{
    phone: string | null;
    email: string | null;
    contactName: string | null;
  } | null>(null);
  const active = media[safeMediaIndex] ?? media[0];

  useEffect(() => {
    if (media.length === 0) {
      if (activeIndex !== 0) setActiveIndex(0);
      return;
    }
    if (activeIndex > media.length - 1) setActiveIndex(media.length - 1);
  }, [media.length, activeIndex]);

  useEffect(() => {
    setBrokenMediaKeys({});
  }, [p.id]);

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

  const shareUrl = listingShareUrl(propertyId, {
    videoUrl: typeof p.videoUrl === 'string' ? p.videoUrl : null,
    force: p.videoUrl ? 'shorts' : 'classic',
  });

  const ownerId = String(p.userId ?? author.id ?? '').trim();
  const isOwner = Boolean(
    user?.id && ownerId && String(user.id).trim() === String(ownerId).trim(),
  );
  const isAgentViewer = user?.role === 'AGENT';
  const showOwnerBadges = Boolean(p.isOwnerListing);
  const contactRevealed =
    isTipListing(p) && (Boolean(p.contactUnlocked) || Boolean(unlockedContact));
  const phone = contactRevealed
    ? (unlockedContact?.phone ?? p.contactPhone ?? '').trim()
    : '';
  const email = contactRevealed
    ? (unlockedContact?.email ?? p.contactEmail ?? '').trim()
    : '';
  const nameContact = contactRevealed
    ? (unlockedContact?.contactName ?? p.contactName ?? '').trim()
    : '';
  const contactUnlockPrice = p.contactUnlockPrice ?? 0;
  const contactUnlockAvailable = p.contactUnlockAvailable !== false;
  const companyName =
    (p as PropertyFeedItem & { companyName?: string | null }).companyName?.trim() ?? '';
  const coverForMessage = classicListingCoverUrl(p);
  const isTip = isTipListing(p);

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
    router.push(`/login?redirect=${encodeURIComponent(path)}`);
  }

  function handleShowContact() {
    if (!isAuthenticated || !apiAccessToken) {
      window.alert(isTip ? 'Pro zobrazení kontaktu se přihlaste.' : 'Pro odeslání zájmu se přihlaste.');
      redirectToLoginForMessages();
      return;
    }
    if (isOwner || contactRevealed || (!isTip && interestSubmitted)) return;
    setContactLeadError(null);
    setContactLeadOpen(true);
  }

  async function handleContactLeadSubmit(lead: {
    name: string;
    email: string;
    phone: string;
    message?: string;
  }) {
    if (!apiAccessToken) return;
    setContactLeadBusy(true);
    setContactLeadError(null);
    const r = await nestListingUnlockContact(apiAccessToken, propertyId, lead);
    setContactLeadBusy(false);
    if (!r.ok || !r.data) {
      if (r.code === 'INSUFFICIENT_CREDIT') {
        setContactLeadOpen(false);
        setShowCreditModal(true);
        return;
      }
      if (r.code === 'BONUS_NOT_ALLOWED_FOR_TIP' || r.code === 'REAL_CREDIT_REQUIRED') {
        setContactLeadError(
          r.error ??
            'Na tento kontakt potřebujete běžný kredit. Bonusový nebo čekající kredit nelze použít.',
        );
        return;
      }
      setContactLeadError(r.error ?? (isTip ? 'Odemčení kontaktu se nezdařilo.' : 'Odeslání zájmu se nezdařilo.'));
      return;
    }

    setContactLeadOpen(false);

    if (!isTip && r.data.submitted) {
      setInterestSubmitted(true);
      setContactSuccessMsg(
        r.data.message ??
          'Děkujeme, prodejce vás bude brzy kontaktovat.',
      );
      return;
    }

    setUnlockedContact({
      phone: r.data.phone ?? null,
      email: r.data.email ?? null,
      contactName: r.data.contactName ?? null,
    });
    setContactSuccessMsg('Kontakt byl odemčen. Vaše údaje byly odeslány inzerentovi.');
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
    'mx-auto flex h-[50px] w-full max-w-[360px] items-center justify-center gap-2 rounded-full border-2 border-orange-400/90 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(255,90,0,0.3)] transition hover:brightness-110 active:scale-[0.99] max-md:max-w-none';

  const secondaryActionClass =
    'mx-auto flex h-[50px] w-full max-w-[360px] items-center justify-center gap-2 rounded-full border-2 border-zinc-300 bg-white px-5 py-2.5 text-sm font-bold text-zinc-800 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 max-md:max-w-none';

  function renderContactBlock(compact = false) {
    if (!contactRevealed || (!phone && !email)) return null;
    return (
      <div
        className={`space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/90 text-sm text-zinc-800 ${compact ? 'mt-3 p-3' : 'mt-3 p-3'}`}
      >
        {contactSuccessMsg ? (
          <p className="font-medium text-emerald-800">{contactSuccessMsg}</p>
        ) : null}
        {nameContact ? <p className="font-semibold">{nameContact}</p> : null}
        {phone ? (
          <p>
            Telefon:{' '}
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
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <ListingDetailLeftSidebar />

        <main className="min-w-0 xl:col-span-6">
          <ListingDetailBackButton />

          {media.length > 0 && active != null ? (
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
                ) : !brokenMediaKeys[active.key] ? (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="w-full"
                    aria-label="Otevřít galerii fotek"
                  >
                    <img
                      src={nestAbsoluteAssetUrl(active.url)}
                      alt={p.title}
                      className="h-auto max-h-[80vh] w-full rounded-2xl bg-black object-contain"
                      onError={() =>
                        setBrokenMediaKeys((prev) => ({ ...prev, [active.key]: true }))
                      }
                    />
                  </button>
                ) : (
                  <div className="flex min-h-[200px] w-full items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500">
                    Náhled není dostupný
                  </div>
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
                        index === safeMediaIndex
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
                        !brokenMediaKeys[item.key] ? (
                          <img
                            src={nestAbsoluteAssetUrl(item.url)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                            onError={() =>
                              setBrokenMediaKeys((prev) => ({ ...prev, [item.key]: true }))
                            }
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-zinc-200 text-[10px] text-zinc-600">
                            Bez náhledu
                          </div>
                        )
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
              <ListingPriceDisplay
                as="div"
                price={p.price}
                isAuthenticated={isAuthenticated}
                className="text-xl font-semibold text-orange-600"
              />
              <div className="text-sm text-zinc-500">
                {p.address?.trim() ? (
                  <>
                    <span className="block text-zinc-700">{p.address.trim()}</span>
                    <span className="mt-0.5 block">{p.location}</span>
                  </>
                ) : (
                  p.location
                )}
              </div>
              {summaryLine ? (
                <div className="text-sm text-zinc-700">{summaryLine}</div>
              ) : null}
              {isTip ? (
                <div className="pt-1">
                  <TipDetailBadge />
                </div>
              ) : null}

              <div className="rounded-2xl border-2 border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-amber-50/40 p-4 shadow-[0_8px_30px_rgba(234,88,0,0.12)] sm:p-5">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-orange-800/75">
                  Rychlé akce
                </p>
                <div className="mt-3 flex flex-col items-center gap-3">
                  {!isOwner && contactRevealed && phone ? (
                    <a href={`tel:${phone}`} className={secondaryActionClass}>
                      📞 Zavolat
                    </a>
                  ) : null}
                  <button type="button" onClick={handleWriteSeller} className={primaryMessageClass}>
                    <MessageCircle className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
                    ✉️ Napsat zprávu
                  </button>
                  {!isOwner && author.whatsappEnabled ? (
                    <WhatsAppContactButton
                      targetUserId={author.id}
                      listingId={propertyId}
                      listingTitle={p.title}
                      listingUrl={shareUrl}
                      variant="secondary"
                      label="💬 WhatsApp"
                      className="w-full max-w-[360px]"
                    />
                  ) : null}
                  {!isOwner && !contactRevealed && contactUnlockAvailable && !( !isTip && interestSubmitted) ? (
                    <button
                      type="button"
                      onClick={handleShowContact}
                      className={secondaryActionClass}
                    >
                      {isTip ? 'Zobrazit kontakt' : 'Mám zájem'}
                      {isTip && contactUnlockPrice > 0
                        ? ` (${contactUnlockPrice.toLocaleString('cs-CZ')} Kč)`
                        : ''}
                    </button>
                  ) : null}
                  {contactSuccessMsg ? (
                    <p className="w-full max-w-[360px] text-sm font-medium text-emerald-800" role="status">
                      {contactSuccessMsg}
                    </p>
                  ) : null}
                  {contactLeadError && !contactLeadOpen ? (
                    <p className="w-full max-w-[360px] text-sm font-medium text-red-600" role="alert">
                      {contactLeadError}
                    </p>
                  ) : null}
                  {renderContactBlock(true)}
                  {sellerActionHint ? (
                    <p className="w-full text-sm font-medium text-amber-800" role="status">
                      {sellerActionHint}
                    </p>
                  ) : null}
                  <div className="flex w-full flex-wrap items-center justify-center gap-3">
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
                      shorts={{
                        videoUrl: typeof p.videoUrl === 'string' ? p.videoUrl : null,
                        apiAccessToken,
                      }}
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
                <p className="font-semibold text-zinc-900">
                  {author.name?.trim() || 'Uživatel'}
                </p>
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
            {!isOwner && !contactRevealed && contactUnlockAvailable && !(!isTip && interestSubmitted) ? (
              <button
                type="button"
                onClick={handleShowContact}
                className={`${secondaryActionClass} mt-3`}
              >
                {isTip ? 'Zobrazit kontakt' : 'Mám zájem'}
                {isTip && contactUnlockPrice > 0
                  ? ` (${contactUnlockPrice.toLocaleString('cs-CZ')} Kč)`
                  : ''}
              </button>
            ) : null}
            {contactSuccessMsg ? (
              <p className="mt-2 text-sm font-medium text-emerald-800" role="status">
                {contactSuccessMsg}
              </p>
            ) : null}
            {renderContactBlock()}
            {!contactRevealed && !isTip ? (
              <p className="mt-2 text-sm text-zinc-600">
                Projevte zájem — inzerent vás bude kontaktovat. Kontakt inzerenta se vám nezobrazí.
              </p>
            ) : null}
            {!contactRevealed && isTip ? (
              <p className="mt-2 text-sm text-zinc-600">
                Kontakt zobrazíte po vyplnění formuláře a zaplacení kreditem.
              </p>
            ) : null}
            <button type="button" onClick={handleWriteSeller} className={`${primaryMessageClass} mt-4`}>
              <MessageCircle className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
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
              <p className="text-sm font-semibold text-zinc-900">Podobné inzeráty</p>
              <ul className="mt-3 space-y-3">
                {other.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={listingDetailHref(item.id, 'classic')}
                      className="block rounded-xl border border-zinc-100 p-3 transition hover:border-orange-200 hover:bg-orange-50/40"
                    >
                      <p className="line-clamp-2 text-sm font-medium text-zinc-900">{item.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.location}</p>
                      <ListingPriceDisplay
                        as="p"
                        price={item.price}
                        isAuthenticated={isAuthenticated}
                        className="mt-1 text-sm font-bold text-[#e85d00]"
                      />
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
              <p className="text-sm font-semibold text-zinc-900">Podobné inzeráty</p>
              <p className="mt-2 text-sm text-zinc-600">Zatím nemáme podobné nabídky.</p>
            </div>
          )}
        </aside>
      </div>

      <ContactLeadModal
        open={contactLeadOpen}
        busy={contactLeadBusy}
        error={contactLeadError}
        defaultName={user?.name ?? ''}
        defaultEmail={user?.email ?? ''}
        defaultPhone={user?.phone ?? ''}
        unlockPrice={contactUnlockPrice}
        mode={isTip ? 'unlock' : 'interest'}
        onClose={() => setContactLeadOpen(false)}
        onSubmit={(lead) => void handleContactLeadSubmit(lead)}
      />

      {showCreditModal ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Dobijte kredit</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Nemáte dostatek kreditu pro zobrazení kontaktu. Dobijte si kredit v profilu.
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                href="/profil/dashboard?tab=settings"
                className="rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
              >
                Dobít kredit
              </Link>
              <button
                type="button"
                onClick={() => setShowCreditModal(false)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      {lightboxOpen && media.filter((m) => m.type === 'image').length > 0 ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-6xl">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Zavřít
              </button>
            </div>
            <img
              src={nestAbsoluteAssetUrl((media[safeMediaIndex] ?? media[0])?.url ?? '')}
              alt={p.title}
              className="max-h-[80vh] w-full rounded-xl object-contain"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
