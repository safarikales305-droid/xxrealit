'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { ShareMenu } from './ShareMenu';

export type ShareButtonsProps = {
  title: string;
  url: string;
  className?: string;
  label?: string;
  variant?: 'icon' | 'pill';
};

export function ShareButtons({
  title,
  url,
  className = '',
  label,
  variant = 'icon',
}: ShareButtonsProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ?? 'Sdílet'}
        title={label ?? 'Sdílet'}
        className={
          variant === 'pill'
            ? `inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm transition hover:bg-zinc-50 ${className}`
            : `inline-flex size-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-50 ${className}`
        }
      >
        <Share2 className="size-4" />
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
