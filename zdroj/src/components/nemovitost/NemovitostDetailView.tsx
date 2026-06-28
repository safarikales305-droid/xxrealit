'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ContactGateModals, useContactGate } from '@/components/listing/ContactGate';
import { MessageSellerModal } from '@/components/messages/MessageSellerModal';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestShareListingByEmail,
  nestSubmitOwnerLeadOffer,
  nestToggleFavorite,
} from '@/lib/nest-client';
import type { PropertyDetailAuthor } from '@/lib/property-detail';
import { ListingPriceDisplay } from '@/components/pricing/ListingPriceDisplay';
import { isTipListing } from '@/lib/is-tip-listing';
import { listingShareUrl } from '@/lib/public-share-url';
import { ListingDetailBackButton } from '@/components/nemovitost/ListingDetailBackButton';
import { ListingDetailLeftSidebar } from '@/components/nemovitost/ListingDetailLeftSidebar';
import { ListingActionBar } from '@/components/nemovitost/listing-detail/ListingActionBar';
import { ListingContactCard } from '@/components/nemovitost/listing-detail/ListingContactCard';
import { ListingDescription } from '@/components/nemovitost/listing-detail/ListingDescription';
import { ListingDetailGallery } from '@/components/nemovitost/listing-detail/ListingDetailGallery';
import { ListingDetailHeader } from '@/components/nemovitost/listing-detail/ListingDetailHeader';
import { ListingDetailLightbox } from '@/components/nemovitost/listing-detail/ListingDetailLightbox';
import { ListingDetailMap } from '@/components/nemovitost/listing-detail/ListingDetailMap';
import { ListingMobileStickyBar } from '@/components/nemovitost/listing-detail/ListingMobileStickyBar';
import { ListingMortgageCalculator } from '@/components/nemovitost/listing-detail/ListingMortgageCalculator';
import { ListingParametersTable } from '@/components/nemovitost/listing-detail/ListingParametersTable';
import { ListingQuickParams } from '@/components/nemovitost/listing-detail/ListingQuickParams';
import { ListingSimilarCarousel } from '@/components/nemovitost/listing-detail/ListingSimilarCarousel';
import {
  buildMediaList,
  buildParameterRows,
  buildQuickParams,
  mapsQuery,
  pricePerSqm,
} from '@/components/nemovitost/listing-detail/listing-detail-utils';
import { ShareButtons } from '@/components/share/ShareButtons';
import { classicListingCoverUrl, type PropertyFeedItem } from '@/types/property';

type Props = {
  propertyId: string;
  property: PropertyFeedItem;
  author: PropertyDetailAuthor;
  other: PropertyFeedItem[];
  extraFields?: Record<string, unknown>;
};

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
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
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
  const [mobileShareOpen, setMobileShareOpen] = useState(false);

  const avatarSrc =
    author.avatar && author.avatar.trim().length > 0
      ? nestAbsoluteAssetUrl(author.avatar)
      : null;

  const shareUrl = listingShareUrl(propertyId, {
    videoUrl: typeof p.videoUrl === 'string' ? p.videoUrl : null,
    force: p.videoUrl ? 'shorts' : 'classic',
  });

  const ownerId = String(p.userId ?? author.id ?? '').trim();
  const isOwner = Boolean(user?.id && ownerId && String(user.id).trim() === String(ownerId).trim());
  const isAgentViewer = user?.role === 'AGENT';
  const showOwnerBadges = Boolean(p.isOwnerListing);
  const isTip = isTipListing(p);

  function redirectToLoginForMessages() {
    router.push(`/login?redirect=${encodeURIComponent(`/nemovitost/${encodeURIComponent(propertyId)}`)}`);
  }

  const contactGate = useContactGate({
    listing: p,
    isOwner,
    isAuthenticated,
    apiAccessToken,
    viewerRole: user?.role,
    defaultName: user?.name ?? '',
    defaultEmail: user?.email ?? '',
    defaultPhone: user?.phone ?? '',
    onLoginRequired: redirectToLoginForMessages,
    onAfterUnlock: () => router.refresh(),
  });

  const contactRevealed = contactGate.contactRevealed;
  const sellerContactLocked = contactGate.contactLocked;
  const contactUnlockPrice = p.contactUnlockPrice ?? 0;
  const contactUnlockAvailable = p.contactUnlockAvailable !== false;
  const phone = contactRevealed ? (p.contactPhone ?? '').trim() : '';
  const email = contactRevealed ? (p.contactEmail ?? '').trim() : '';
  const nameContact = contactRevealed ? (p.contactName ?? '').trim() : '';
  const companyName = sellerContactLocked
    ? ''
    : ((p as PropertyFeedItem & { companyName?: string | null }).companyName?.trim() ?? '');
  const coverForMessage = classicListingCoverUrl(p);

  const quickParams = useMemo(() => buildQuickParams(p, extraFields), [p, extraFields]);
  const paramRows = useMemo(
    () => buildParameterRows(p, extraFields, isAuthenticated),
    [p, extraFields, isAuthenticated],
  );
  const mapQuery = mapsQuery(p);

  const profileHref =
    author.role === 'AGENT' && author.id
      ? `/profile/${encodeURIComponent(author.id)}`
      : author.id
        ? `/profil/${encodeURIComponent(author.id)}`
        : undefined;

  useEffect(() => {
    setLiked(Boolean(p.liked));
  }, [p.id, p.liked]);

  useEffect(() => {
    setShareSenderName(user?.name ?? '');
    setShareSenderEmail(user?.email ?? '');
  }, [user?.email, user?.name]);

  function handleShowContact() {
    contactGate.openContactForm();
  }

  function handleWriteSeller() {
    const result = contactGate.requestMessaging(() => setSellerModalOpen(true));
    if (result === 'own-listing') {
      setSellerActionHint('Toto je váš vlastní inzerát.');
      window.setTimeout(() => setSellerActionHint(null), 5000);
    }
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
    setShareEmailMsg(
      result.ok ? (result.message ?? 'E-mail byl odeslán.') : (result.error ?? 'Odeslání selhalo.'),
    );
  }

  const unlockCta = !isOwner && !contactRevealed && contactUnlockAvailable && !(!isTip && contactGate.interestSubmitted);

  const lockedBlock = sellerContactLocked ? (
    <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
      <p className="font-semibold text-zinc-900">Kontakt skrytý</p>
      <p>Telefon a e-mail se zobrazí po odemčení kontaktu.</p>
    </div>
  ) : null;

  const revealedBlock =
    contactGate.contactSuccessMsg && contactRevealed ? (
      <p className="text-sm font-medium text-emerald-800">{contactGate.contactSuccessMsg}</p>
    ) : null;

  const contactUnlockSection = unlockCta ? (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
      {contactGate.propertySeekerTipBlocked ? (
        <p className="text-sm font-medium text-zinc-700">{contactGate.propertySeekerTipMessage}</p>
      ) : (
        <button
          type="button"
          onClick={handleShowContact}
          className="w-full rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-sm font-bold text-white shadow-md"
        >
          Zobrazit kontakt
          {isTip && contactUnlockPrice > 0
            ? ` (${contactUnlockPrice.toLocaleString('cs-CZ')} Kč)`
            : ''}
        </button>
      )}
      {contactGate.contactLeadError && !contactGate.contactLeadOpen ? (
        <p className="mt-2 text-sm text-red-600">{contactGate.contactLeadError}</p>
      ) : null}
    </section>
  ) : null;

  return (
    <div className="bg-zinc-50/80 pb-24 xl:pb-10">
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6">
        <ListingDetailBackButton />

        <div className="mt-4 space-y-5">
          <ListingDetailHeader
            property={p}
            extraFields={extraFields}
            author={author}
            isAuthenticated={isAuthenticated}
            isTip={isTip}
            showOwnerBadges={showOwnerBadges}
          />

          <ListingDetailGallery
            title={p.title}
            media={media}
            onOpenLightbox={(i) => {
              setLightboxIndex(i);
              setLightboxOpen(true);
            }}
          />

          <div className="lg:hidden">
            <ListingPriceDisplay
              as="div"
              price={p.price}
              isAuthenticated={isAuthenticated}
              className="text-2xl font-bold text-[#e85d00]"
              labelClassName="text-sm text-zinc-500"
            />
            <div className="mt-2 space-y-0.5 text-sm text-zinc-600">
              {pricePerSqm(p.price, extraFields.area) != null && isAuthenticated ? (
                <p>
                  Cena za m²:{' '}
                  <strong className="text-zinc-900">
                    {pricePerSqm(p.price, extraFields.area)!.toLocaleString('cs-CZ')} Kč/m²
                  </strong>
                </p>
              ) : null}
              <p>
                Typ nabídky:{' '}
                <strong className="text-zinc-900">
                  {String(extraFields.offerType ?? extraFields.type ?? 'prodej')}
                </strong>
              </p>
              {extraFields.condition ? (
                <p>
                  Stav: <strong className="text-zinc-900">{String(extraFields.condition)}</strong>
                </p>
              ) : null}
            </div>
          </div>

          <ListingQuickParams items={quickParams} />

          <div className="hidden rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm lg:block">
            <ListingActionBar
              liked={liked}
              likeBusy={likeBusy}
              onFavorite={handleFavoriteClick}
              shareTitle={p.title}
              shareUrl={shareUrl}
              videoUrl={typeof p.videoUrl === 'string' ? p.videoUrl : null}
              apiAccessToken={apiAccessToken}
              onShareEmail={() => setShareEmailOpen(true)}
              onMessage={handleWriteSeller}
              messageDisabled={sellerContactLocked}
              phone={phone}
              showPhone={!isOwner && contactRevealed && Boolean(phone)}
              whatsappEnabled={!isOwner && contactRevealed && Boolean(author.whatsappEnabled)}
              authorId={author.id}
              propertyId={propertyId}
              listingTitle={p.title}
              whatsappDisabled={sellerContactLocked}
            />
            {sellerActionHint ? (
              <p className="mt-2 text-sm text-amber-800">{sellerActionHint}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="space-y-6 lg:col-span-2">
              {contactUnlockSection}

              <div className="lg:hidden">
                <ListingContactCard
                  author={author}
                  avatarSrc={avatarSrc}
                  companyName={companyName}
                  phone={phone}
                  email={email}
                  nameContact={nameContact}
                  contactRevealed={contactRevealed || isOwner}
                  sellerContactLocked={sellerContactLocked}
                  onMessage={handleWriteSeller}
                  messageDisabled={sellerContactLocked}
                  profileHref={profileHref}
                  propertyId={propertyId}
                  listingTitle={p.title}
                  shareUrl={shareUrl}
                  lockedBlock={lockedBlock}
                  revealedBlock={revealedBlock}
                />
              </div>

              <div className="lg:hidden">
                <ListingActionBar
                  layout="stack"
                  liked={liked}
                  likeBusy={likeBusy}
                  onFavorite={handleFavoriteClick}
                  shareTitle={p.title}
                  shareUrl={shareUrl}
                  videoUrl={typeof p.videoUrl === 'string' ? p.videoUrl : null}
                  apiAccessToken={apiAccessToken}
                  onShareEmail={() => setShareEmailOpen(true)}
                  onMessage={handleWriteSeller}
                  messageDisabled={sellerContactLocked}
                  phone={phone}
                  showPhone={!isOwner && contactRevealed && Boolean(phone)}
                  whatsappEnabled={!isOwner && contactRevealed && Boolean(author.whatsappEnabled)}
                  authorId={author.id}
                  propertyId={propertyId}
                  listingTitle={p.title}
                  whatsappDisabled={sellerContactLocked}
                />
              </div>

              <div className="lg:hidden">
                <ListingParametersTable rows={paramRows} />
              </div>

              {p.description ? <ListingDescription text={p.description} /> : null}

              <div className="hidden lg:block">
                <ListingParametersTable rows={paramRows} />
              </div>

              <ListingDetailMap query={mapQuery} />

              <div className="hidden lg:block">
                <ListingSimilarCarousel items={other} isAuthenticated={isAuthenticated} />
              </div>
            </div>

            <aside className="hidden space-y-4 lg:block">
              <div className="sticky top-20 space-y-4">
                <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <ListingPriceDisplay
                    as="div"
                    price={p.price}
                    isAuthenticated={isAuthenticated}
                    className="text-2xl font-bold text-[#e85d00]"
                    labelClassName="sr-only"
                  />
                </section>

                <ListingContactCard
                  author={author}
                  avatarSrc={avatarSrc}
                  companyName={companyName}
                  phone={phone}
                  email={email}
                  nameContact={nameContact}
                  contactRevealed={contactRevealed || isOwner}
                  sellerContactLocked={sellerContactLocked}
                  onMessage={handleWriteSeller}
                  messageDisabled={sellerContactLocked}
                  profileHref={profileHref}
                  propertyId={propertyId}
                  listingTitle={p.title}
                  shareUrl={shareUrl}
                  lockedBlock={lockedBlock}
                  revealedBlock={revealedBlock}
                />

                {contactUnlockSection}

                <ListingMortgageCalculator price={p.price} />

                <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-zinc-900">Sdílení</p>
                  <div className="mt-3">
                    <ShareButtons
                      title={p.title}
                      url={shareUrl}
                      variant="lightRail"
                      label="Sdílet inzerát"
                      shorts={{
                        videoUrl: typeof p.videoUrl === 'string' ? p.videoUrl : null,
                        apiAccessToken,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShareEmailOpen(true)}
                    className="mt-2 w-full rounded-xl border border-zinc-200 py-2 text-sm font-semibold hover:bg-zinc-50"
                  >
                    Sdílet e-mailem
                  </button>
                </section>

                {other.length > 0 ? (
                  <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-zinc-900">Podobné nabídky</p>
                    <ul className="mt-3 space-y-2">
                      {other.slice(0, 3).map((item) => (
                        <li key={item.id}>
                          <Link
                            href={`/nemovitost/${item.id}`}
                            className="block rounded-lg border border-zinc-100 p-2 text-sm hover:border-orange-200"
                          >
                            <p className="line-clamp-2 font-medium">{item.title}</p>
                            <ListingPriceDisplay
                              as="p"
                              price={item.price}
                              isAuthenticated={isAuthenticated}
                              className="mt-1 text-xs font-bold text-[#e85d00]"
                              labelClassName="sr-only"
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center text-xs text-zinc-500">
                  Reklamní prostor
                </section>

                <ListingDetailLeftSidebar embedded />
              </div>
            </aside>
          </div>

          <div className="lg:hidden">
            <div className="mt-6">
              <ListingSimilarCarousel items={other} isAuthenticated={isAuthenticated} />
            </div>
          </div>

          {(contactRevealed || isOwner) && p.isOwnerListing && isAgentViewer && !isOwner ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setOwnerLeadErr(null);
                  setOwnerLeadOpen(true);
                }}
                className="w-full rounded-xl border-2 border-zinc-300 py-3 text-sm font-bold text-zinc-800 hover:border-orange-300"
              >
                Nabídnout služby vlastníkovi
              </button>
            </section>
          ) : null}
        </div>
      </div>

      <ListingMobileStickyBar
        liked={liked}
        likeBusy={likeBusy}
        onFavorite={handleFavoriteClick}
        onShare={() => setMobileShareOpen(true)}
        onMessage={handleWriteSeller}
        onCall={phone ? () => window.open(`tel:${phone}`) : undefined}
        showCall={!isOwner && contactRevealed && Boolean(phone)}
        messageDisabled={sellerContactLocked}
      />

      <ListingDetailLightbox
        open={lightboxOpen}
        media={media}
        index={lightboxIndex}
        title={p.title}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
      />

      <ContactGateModals
        gate={contactGate}
        defaultName={user?.name ?? ''}
        defaultEmail={user?.email ?? ''}
        defaultPhone={user?.phone ?? ''}
      />

      <MessageSellerModal
        open={sellerModalOpen}
        onClose={() => setSellerModalOpen(false)}
        propertyId={propertyId}
        listingTitle={p.title}
        price={p.price}
        location={p.location}
        coverImageUrl={coverForMessage}
        token={apiAccessToken}
        onSent={(conversationId) => router.push(`/profil/zpravy/${conversationId}`)}
      />

      {ownerLeadOpen ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Nabídka služeb vlastníkovi</h2>
            <textarea
              value={ownerLeadText}
              onChange={(e) => setOwnerLeadText(e.target.value)}
              rows={5}
              className="mt-4 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Stručně představte svou kancelář…"
            />
            {ownerLeadErr ? <p className="mt-2 text-sm text-red-600">{ownerLeadErr}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOwnerLeadOpen(false)} className="rounded-full border px-4 py-2 text-sm">
                Zrušit
              </button>
              <button
                type="button"
                disabled={ownerLeadBusy}
                onClick={() => void handleOwnerLeadSubmit()}
                className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2 text-sm font-bold text-white"
              >
                {ownerLeadBusy ? 'Odesílám…' : 'Odeslat'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareEmailOpen ? (
        <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-2xl border bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Sdílet inzerát e-mailem</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="email"
                value={shareRecipientEmail}
                onChange={(e) => setShareRecipientEmail(e.target.value)}
                className="rounded-xl border px-3 py-2 text-sm"
                placeholder="E-mail příjemce *"
              />
              <input
                type="text"
                value={shareRecipientName}
                onChange={(e) => setShareRecipientName(e.target.value)}
                className="rounded-xl border px-3 py-2 text-sm"
                placeholder="Jméno příjemce"
              />
              <input
                type="text"
                value={shareSenderName}
                onChange={(e) => setShareSenderName(e.target.value)}
                className="rounded-xl border px-3 py-2 text-sm"
                placeholder="Vaše jméno"
              />
              <input
                type="email"
                value={shareSenderEmail}
                onChange={(e) => setShareSenderEmail(e.target.value)}
                className="rounded-xl border px-3 py-2 text-sm"
                placeholder="Váš e-mail"
              />
            </div>
            <textarea
              value={shareSenderMessage}
              onChange={(e) => setShareSenderMessage(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Osobní zpráva"
            />
            {shareEmailMsg ? <p className="mt-3 text-sm">{shareEmailMsg}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShareEmailOpen(false)} className="rounded-full border px-4 py-2 text-sm">
                Zavřít
              </button>
              <button
                type="button"
                disabled={shareEmailBusy}
                onClick={() => void handleShareByEmail()}
                className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2 text-sm font-bold text-white"
              >
                {shareEmailBusy ? 'Odesílám…' : 'Odeslat'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mobileShareOpen ? (
        <div className="fixed inset-0 z-[215] flex items-end justify-center bg-black/50 p-4 xl:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <p className="font-semibold">Sdílet inzerát</p>
            <div className="mt-3">
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
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileShareOpen(false);
                setShareEmailOpen(true);
              }}
              className="mt-3 w-full rounded-xl border py-2 text-sm font-semibold"
            >
              Sdílet e-mailem
            </button>
            <button
              type="button"
              onClick={() => setMobileShareOpen(false)}
              className="mt-2 w-full py-2 text-sm text-zinc-500"
            >
              Zavřít
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
