'use client';

import { Heart } from 'lucide-react';
import { ShareButtons } from '@/components/share/ShareButtons';
import { WhatsAppContactButton } from '@/components/whatsapp/WhatsAppContactButton';

type Props = {
  liked: boolean;
  likeBusy: boolean;
  onFavorite: () => void;
  shareTitle: string;
  shareUrl: string;
  videoUrl: string | null;
  apiAccessToken: string | null;
  onShareEmail: () => void;
  onMessage: () => void;
  messageDisabled: boolean;
  phone?: string;
  showPhone: boolean;
  whatsappEnabled: boolean;
  authorId: string;
  propertyId: string;
  listingTitle: string;
  whatsappDisabled: boolean;
  layout?: 'row' | 'stack';
};

export function ListingActionBar({
  liked,
  likeBusy,
  onFavorite,
  shareTitle,
  shareUrl,
  videoUrl,
  apiAccessToken,
  onShareEmail,
  onMessage,
  messageDisabled,
  phone,
  showPhone,
  whatsappEnabled,
  authorId,
  propertyId,
  listingTitle,
  whatsappDisabled,
  layout = 'row',
}: Props) {
  const btn =
    'inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/50';
  const btnPrimary =
    'inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';
  const fav =
    'inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border-2 border-orange-200 bg-white text-orange-600 shadow-sm transition hover:bg-orange-50 disabled:opacity-50';

  return (
    <div
      className={
        layout === 'stack'
          ? 'flex flex-col gap-2'
          : 'flex flex-col gap-2 sm:flex-row sm:flex-wrap'
      }
    >
      <button
        type="button"
        disabled={likeBusy}
        onClick={onFavorite}
        className={`${fav} ${liked ? 'border-orange-500 bg-gradient-to-br from-[#ff6a00] to-[#ff3c00] text-white' : ''} ${layout === 'row' ? 'sm:flex-none' : 'w-full'}`}
        aria-label={liked ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
      >
        <Heart className={`size-5 ${liked ? 'fill-white' : ''}`} strokeWidth={liked ? 0 : 2} />
        <span className="sr-only">Oblíbené</span>
      </button>

      <div className={layout === 'row' ? 'flex flex-1 flex-wrap gap-2' : 'flex flex-col gap-2'}>
        <div className={layout === 'row' ? 'flex flex-1 gap-2' : 'contents'}>
          <ShareButtons
            title={shareTitle}
            url={shareUrl}
            variant="lightRail"
            label="📤 Sdílet"
            shorts={{ videoUrl, apiAccessToken }}
          />
          <button type="button" onClick={onShareEmail} className={btn}>
            ✉ E-mail
          </button>
        </div>
        <button
          type="button"
          onClick={onMessage}
          disabled={messageDisabled}
          className={messageDisabled ? `${btn} cursor-not-allowed opacity-50` : btnPrimary}
        >
          ✉ Napsat
        </button>
        {showPhone && phone ? (
          <a href={`tel:${phone}`} className={btn}>
            📞 Zavolat
          </a>
        ) : null}
        {whatsappEnabled ? (
          <WhatsAppContactButton
            targetUserId={authorId}
            listingId={propertyId}
            listingTitle={listingTitle}
            listingUrl={shareUrl}
            variant="secondary"
            label="💬 WhatsApp"
            className={layout === 'stack' ? 'w-full' : 'flex-1'}
            disabled={whatsappDisabled}
          />
        ) : null}
      </div>
    </div>
  );
}
