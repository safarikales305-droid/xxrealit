'use client';

import { useState } from 'react';
import { nestWhatsAppClick } from '@/lib/nest-client';

type Props = {
  targetUserId: string;
  listingId?: string;
  listingTitle?: string;
  listingUrl?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'green';
  label?: string;
  disabled?: boolean;
};

const VARIANT_CLASS: Record<NonNullable<Props['variant']>, string> = {
  primary:
    'rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#1ebe5d] disabled:opacity-60',
  secondary:
    'rounded-full border border-[#25D366]/40 bg-white px-4 py-2.5 text-sm font-semibold text-[#128C7E] transition hover:bg-[#25D366]/10 disabled:opacity-60',
  green:
    'flex w-full max-w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#25D366]/50 bg-[#25D366] px-3 py-2 text-[13px] font-extrabold leading-tight text-white shadow-md transition hover:brightness-110 active:scale-[0.99] max-md:min-h-[44px] sm:px-4 sm:py-3 sm:text-sm disabled:opacity-60',
};

export function WhatsAppContactButton({
  targetUserId,
  listingId,
  listingTitle,
  listingUrl,
  className = '',
  variant = 'primary',
  label = 'Napsat na WhatsApp',
  disabled = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (disabled) return;
    setBusy(true);
    setError(null);
    const res = await nestWhatsAppClick({
      targetUserId,
      listingId,
      listingTitle,
      listingUrl,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'WhatsApp odkaz se nepodařilo otevřít.');
      return;
    }
    window.open(res.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => void handleClick()}
        className={`${VARIANT_CLASS[variant]} ${disabled ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400' : ''}`}
        aria-label={label}
      >
        {busy ? 'Otevírám WhatsApp…' : label}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
