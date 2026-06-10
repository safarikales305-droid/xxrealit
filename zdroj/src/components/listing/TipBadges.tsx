'use client';

import { useId, useState } from 'react';
import { TIP_LISTING_TOOLTIP } from '@/lib/is-tip-listing';

type TipShortsStickerProps = {
  /** Pod CTA bonusem pro nepřihlášené (GuestShortsCta). */
  belowGuestCta?: boolean;
  /** Pod mobilním tlačítkem Filtry v levém horním rohu. */
  belowMobileFilters?: boolean;
};

export function TipShortsSticker({ belowGuestCta, belowMobileFilters }: TipShortsStickerProps) {
  const className = [
    'tip-listing-sticker pointer-events-none inline-flex min-w-[5.5rem] max-w-[6.875rem] items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white sm:min-w-[6.25rem] sm:px-3.5 sm:py-2 sm:text-xs',
    belowGuestCta ? 'tip-listing-sticker--below-cta' : '',
    belowMobileFilters && !belowGuestCta ? 'tip-listing-sticker--below-filters' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} aria-label="Tipovaný inzerát">
      <span aria-hidden>💡</span>
      <span>TIP</span>
    </div>
  );
}

export function TipCardBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[#ff5a00] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-[0_6px_18px_rgba(255,90,0,0.45)] sm:px-3 sm:py-1.5 sm:text-[11px] ${className}`}
      aria-label="Tipovaný inzerát"
    >
      <span aria-hidden>💡</span>
      TIP
    </span>
  );
}

export function TipDetailBadge() {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-gradient-to-r from-[#ff6a00] to-[#ff5a00] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-[0_8px_24px_rgba(255,90,0,0.35)] transition hover:brightness-105 sm:px-4 sm:py-2 sm:text-sm"
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>💡</span>
        TIP NABÍDKA
      </button>
      {open ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-2 max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-left text-xs leading-relaxed text-zinc-700 shadow-lg sm:text-sm"
        >
          {TIP_LISTING_TOOLTIP}
        </div>
      ) : null}
    </div>
  );
}

export function AdminListingTypeBadge({
  listingType,
  isTip,
}: {
  listingType?: string | null;
  isTip?: boolean;
}) {
  if (isTip) {
    return (
      <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold uppercase text-orange-900">
        TIP
      </span>
    );
  }
  const lt = String(listingType ?? '')
    .trim()
    .toUpperCase();
  if (lt === 'SHORTS') {
    return (
      <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold uppercase text-violet-900">
        SHORTS
      </span>
    );
  }
  return (
    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold uppercase text-zinc-800">
      KLASIK
    </span>
  );
}
