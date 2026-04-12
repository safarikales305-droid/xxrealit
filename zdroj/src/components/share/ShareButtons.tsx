'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { ShareMenu } from './ShareMenu';

export type ShareButtonsProps = {
  title: string;
  url: string;
  className?: string;
  label?: string;
  /** `videoRail` — velký kulatý button pro overlay u shorts (tmavé pozadí, oranžový hover). */
  /** `lightRail` — stejná velikost jako videoRail, pro světlé pozadí (detail inzerátu). */
  variant?: 'icon' | 'pill' | 'videoRail' | 'lightRail';
  /** `brand` — oranžový pill pro stránku inzerátu. */
  tone?: 'neutral' | 'brand';
};

export function ShareButtons({
  title,
  url,
  className = '',
  label,
  variant = 'icon',
  tone = 'neutral',
}: ShareButtonsProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);

  const pillBrand =
    tone === 'brand'
      ? 'inline-flex min-h-[48px] items-center gap-2 rounded-full border-2 border-orange-400/80 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/20 transition hover:opacity-[0.96] active:scale-[0.98]'
      : 'inline-flex min-h-[48px] items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 shadow-md transition hover:border-orange-200 hover:bg-orange-50/80';

  const baseClass =
    variant === 'videoRail'
      ? `inline-flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-white/35 bg-black/65 text-white shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-orange-400/80 hover:bg-orange-600/95 hover:text-white active:scale-95 ${className}`
      : variant === 'lightRail'
        ? `inline-flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-orange-300/90 bg-white text-orange-700 shadow-[0_6px_24px_rgba(0,0,0,0.08)] transition hover:border-orange-500 hover:bg-gradient-to-br hover:from-orange-50 hover:to-amber-50 hover:text-orange-800 active:scale-95 ${className}`
      : variant === 'pill'
        ? `${pillBrand} ${className}`
        : `inline-flex size-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 sm:size-11 ${className}`;

  const iconSize =
    variant === 'videoRail' || variant === 'lightRail'
      ? 'size-6'
      : variant === 'pill'
        ? 'size-5'
        : 'size-4';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ?? 'Sdílet'}
        title={label ?? 'Sdílet'}
        className={baseClass}
      >
        <Share2
          className={iconSize}
          strokeWidth={variant === 'videoRail' || variant === 'lightRail' ? 2.25 : 2}
        />
        {variant === 'pill' && (label ?? 'Sdílet')}
      </button>
      {open ? (
        <ShareMenu
          title={title}
          url={url}
          onClose={() => setOpen(false)}
          onCopied={() => {
            setToast(true);
            window.setTimeout(() => setToast(false), 2200);
          }}
        />
      ) : null}
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[250] -translate-x-1/2 rounded-full border border-zinc-200 bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
          role="status"
        >
          Odkaz zkopírován
        </div>
      ) : null}
    </>
  );
}
