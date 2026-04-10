'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { ShareMenu } from './ShareMenu';

export type ShareButtonsProps = {
  title: string;
  url: string;
  className?: string;
  label?: string;
};

export function ShareButtons({
  title,
  url,
  className = '',
  label = 'Sdílet',
}: ShareButtonsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50'
        }
        aria-label={label}
      >
        <Share2 className="h-4 w-4 shrink-0" />
        {label ? <span className="hidden sm:inline">{label}</span> : null}
      </button>
      <ShareMenu open={open} onClose={() => setOpen(false)} title={title} url={url} />
    </>
  );
}
