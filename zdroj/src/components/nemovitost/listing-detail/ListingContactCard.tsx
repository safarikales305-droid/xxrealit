'use client';

import { MessageCircle, ShieldCheck } from 'lucide-react';
import { WhatsAppContactButton } from '@/components/whatsapp/WhatsAppContactButton';
import { roleLabel } from './listing-detail-utils';
import type { PropertyDetailAuthor } from '@/lib/property-detail';

type Props = {
  author: PropertyDetailAuthor;
  avatarSrc: string | null;
  companyName: string;
  phone: string;
  email: string;
  nameContact: string;
  contactRevealed: boolean;
  sellerContactLocked: boolean;
  onMessage: () => void;
  messageDisabled: boolean;
  profileHref?: string;
  onProfileClick?: () => void;
  propertyId: string;
  listingTitle: string;
  shareUrl: string;
  lockedBlock?: React.ReactNode;
  revealedBlock?: React.ReactNode;
  compact?: boolean;
};

export function ListingContactCard({
  author,
  avatarSrc,
  companyName,
  phone,
  email,
  nameContact,
  contactRevealed,
  sellerContactLocked,
  onMessage,
  messageDisabled,
  profileHref,
  onProfileClick,
  propertyId,
  listingTitle,
  shareUrl,
  lockedBlock,
  revealedBlock,
  compact,
}: Props) {
  const displayName = nameContact || author.name?.trim() || 'Inzerent';
  const showWhatsapp =
    contactRevealed && !sellerContactLocked && Boolean(author.whatsappEnabled);
  const profileInteractive = Boolean(profileHref && onProfileClick);

  const avatarBlock = (
    <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 text-3xl font-bold text-zinc-500 shadow-inner">
      {avatarSrc ? (
        <img src={avatarSrc} alt="" width={80} height={80} className="size-full object-cover" />
      ) : (
        (displayName.charAt(0) || 'U').toUpperCase()
      )}
    </div>
  );

  const nameBlock = (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-lg font-bold text-zinc-900">{displayName}</p>
      {author.professionalVerified ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="size-3.5" aria-hidden />
          Ověřený účet
        </span>
      ) : null}
    </div>
  );

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Kontakt na inzerenta</h2>
      <div className={`mt-4 flex flex-col gap-4 ${compact ? '' : 'sm:flex-row sm:items-start'}`}>
        {profileInteractive ? (
          <button
            type="button"
            onClick={onProfileClick}
            className="shrink-0 rounded-2xl transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d00]"
            aria-label="Zobrazit profil inzerenta"
          >
            {avatarBlock}
          </button>
        ) : (
          avatarBlock
        )}
        <div className="min-w-0 flex-1 space-y-2">
          {profileInteractive ? (
            <button
              type="button"
              onClick={onProfileClick}
              className="block w-full text-left transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d00]"
            >
              {nameBlock}
            </button>
          ) : (
            nameBlock
          )}
          <p className="text-sm text-zinc-600">{roleLabel(author.role)}</p>
          {companyName ? <p className="text-sm font-medium text-zinc-700">{companyName}</p> : null}

          {lockedBlock}
          {revealedBlock}

          {contactRevealed && !sellerContactLocked ? (
            <dl className="mt-2 space-y-1.5 text-sm text-zinc-700">
              {phone ? (
                <div>
                  <dt className="inline text-zinc-500">Telefon: </dt>
                  <dd className="inline">
                    <a href={`tel:${phone}`} className="font-semibold text-[#e85d00] hover:underline">
                      {phone}
                    </a>
                  </dd>
                </div>
              ) : null}
              {email ? (
                <div>
                  <dt className="inline text-zinc-500">E-mail: </dt>
                  <dd className="inline break-all">
                    <a href={`mailto:${email}`} className="font-semibold text-[#e85d00] hover:underline">
                      {email}
                    </a>
                  </dd>
                </div>
              ) : null}
              {showWhatsapp ? (
                <div className="pt-1">
                  <WhatsAppContactButton
                    targetUserId={author.id}
                    listingId={propertyId}
                    listingTitle={listingTitle}
                    listingUrl={shareUrl}
                    variant="secondary"
                    label="💬 WhatsApp"
                    className="w-full sm:w-auto"
                  />
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={onMessage}
              disabled={messageDisabled}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-sm font-bold text-white shadow-md disabled:opacity-50"
            >
              <MessageCircle className="size-4" aria-hidden />
              Napsat
            </button>
            {phone && contactRevealed ? (
              <a
                href={`tel:${phone}`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-orange-200"
              >
                Zavolat
              </a>
            ) : null}
            {profileInteractive ? (
              <button
                type="button"
                onClick={onProfileClick}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-orange-200"
              >
                Zobrazit profil
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
