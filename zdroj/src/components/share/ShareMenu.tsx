'use client';

import { useCallback, useEffect } from 'react';
import {
  Camera,
  ExternalLink,
  Facebook,
  Link2,
  PlayCircle,
  Share2,
  X,
} from 'lucide-react';

export type ShareMenuProps = {
  title: string;
  url: string;
  onClose: () => void;
  onCopied?: () => void;
};

const facebookShareUrl = (u: string) =>
  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`;

async function handleNativeShare(title: string, url: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  try {
    await navigator.share({ title, url });
    return true;
  } catch {
    return false;
  }
}

async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export function ShareMenu({ title, url, onClose, onCopied }: ShareMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const notifyCopied = useCallback(() => {
    onCopied?.();
  }, [onCopied]);

  const openInNew = useCallback(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sdílet"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Zavřít"
        onClick={onClose}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-md rounded-t-3xl border border-zinc-200/80 bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <span className="text-sm font-semibold text-zinc-900">Sdílet</span>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
            aria-label="Zavřít"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[min(70dvh,28rem)] space-y-1 overflow-y-auto p-3 pb-6">
          <button
            type="button"
            onClick={async () => {
              const ok = await handleNativeShare(title, url);
              if (ok) onClose();
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
          >
            <Share2 className="size-5 shrink-0 text-orange-600" />
            <span>Sdílet (systém)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              window.open(facebookShareUrl(url), '_blank', 'noopener,noreferrer');
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
          >
            <Facebook className="size-5 shrink-0 text-blue-600" />
            <span>Facebook</span>
          </button>
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-2">
            <p className="px-2 pb-2 pt-1 text-xs font-medium text-zinc-500">
              TikTok, YouTube a Instagram nemají spolehlivé webové sdílení — zkopírujte odkaz nebo
              obsah otevřete.
            </p>
            <button
              type="button"
              onClick={() => {
                void copyLink(url).then((ok) => {
                  if (ok) notifyCopied();
                });
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-white"
            >
              <Camera className="size-4 shrink-0 text-zinc-600" />
              <span>Instagram — kopírovat odkaz</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void copyLink(url).then((ok) => {
                  if (ok) notifyCopied();
                });
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-white"
            >
              <PlayCircle className="size-4 shrink-0 text-zinc-600" />
              <span>YouTube — kopírovat odkaz</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void copyLink(url).then((ok) => {
                  if (ok) notifyCopied();
                });
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-white"
            >
              <Link2 className="size-4 shrink-0 text-zinc-600" />
              <span>TikTok — kopírovat odkaz</span>
            </button>
            <button
              type="button"
              onClick={openInNew}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-white"
            >
              <ExternalLink className="size-4 shrink-0 text-zinc-600" />
              <span>Otevřít obsah</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              void copyLink(url).then((ok) => {
                if (ok) notifyCopied();
              });
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            <Link2 className="size-4" />
            Kopírovat odkaz
          </button>
        </div>
      </div>
    </div>
  );
}
