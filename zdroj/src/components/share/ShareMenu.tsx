'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Copy,
  ExternalLink,
  Link2,
  PlayCircle,
  Share2,
  X,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { resolveShareUrl } from '@/lib/resolve-share-url';

export type ShareMenuProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string;
};

async function handleNativeShare(title: string, url: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  try {
    await navigator.share({ title, url });
    return true;
  } catch {
    return false;
  }
}

export function ShareMenu({ open, onClose, title, url }: ShareMenuProps) {
  const { showToast } = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const [absUrl, setAbsUrl] = useState(url);

  useEffect(() => {
    if (open) setAbsUrl(resolveShareUrl(url));
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const copyLink = useCallback(async () => {
    const target = resolveShareUrl(url);
    try {
      await navigator.clipboard.writeText(target);
      showToast('Odkaz zkopírován');
    } catch {
      showToast('Kopírování se nezdařilo');
    }
  }, [url, showToast]);

  const openFacebook = useCallback(() => {
    const u = encodeURIComponent(resolveShareUrl(url));
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      '_blank',
      'noopener,noreferrer,width=600,height=480',
    );
  }, [url]);

  const openContent = useCallback(() => {
    window.open(resolveShareUrl(url), '_blank', 'noopener,noreferrer');
  }, [url]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Zavřít"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-menu-title"
        className="relative z-[251] w-full max-w-md rounded-t-3xl border border-zinc-200/90 bg-white shadow-xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 id="share-menu-title" className="text-sm font-semibold text-zinc-900">
            Sdílet
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100"
            aria-label="Zavřít"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[min(70dvh,28rem)] space-y-1 overflow-y-auto p-3 pb-6 sm:pb-4">
          <p className="mb-2 truncate px-1 text-xs text-zinc-500" title={absUrl}>
            {absUrl}
          </p>

          <button
            type="button"
            onClick={() => void handleNativeShare(title, resolveShareUrl(url)).then((ok) => ok && onClose())}
            className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200/90 px-3 py-2.5 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
          >
            <Share2 className="size-4 shrink-0 text-orange-600" />
            Sdílet (systém)
          </button>

          <button
            type="button"
            onClick={() => {
              openFacebook();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200/90 px-3 py-2.5 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-[11px] font-bold text-blue-600">
              f
            </span>
            Facebook
          </button>

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-2">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              TikTok · YouTube · Instagram
            </p>
            <p className="mb-2 px-2 text-xs text-zinc-600">
              Přímé webové sdílení není dostupné — zkopírujte odkaz nebo otevřete obsah.
            </p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mb-1 flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-left text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
            >
              <Link2 className="size-4 shrink-0 text-zinc-600" />
              Kopírovat odkaz
            </button>
            <button
              type="button"
              onClick={() => {
                openContent();
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-left text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
            >
              <ExternalLink className="size-4 shrink-0 text-zinc-600" />
              Otevřít obsah
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex flex-col items-center gap-1 rounded-2xl border border-zinc-200/90 py-3 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <Camera className="size-4" />
              Instagram
            </button>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex flex-col items-center gap-1 rounded-2xl border border-zinc-200/90 py-3 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <PlayCircle className="size-4" />
              YouTube
            </button>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex flex-col items-center gap-1 rounded-2xl border border-zinc-200/90 py-3 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <Copy className="size-4" />
              TikTok
            </button>
          </div>

          <button
            type="button"
            onClick={() => void copyLink()}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
          >
            <Copy className="size-4" />
            Kopírovat odkaz
          </button>
        </div>
      </div>
    </div>
  );
}
