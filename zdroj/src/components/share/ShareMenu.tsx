'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  Download,
  ExternalLink,
  Facebook,
  FileText,
  Link2,
  PlayCircle,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react';
import {
  buildListingSharePostText,
  buildShareMessageText,
  facebookDebuggerUrl,
  whatsAppShareUrl,
} from '@/lib/listing-og-metadata';
import { WhatsAppIcon } from '@/components/share/WhatsAppIcon';
import {
  fetchShareTextsClient,
  inferShareContentTypeFromUrl,
  shareTextsForType,
  type ShareContentType,
} from '@/lib/share-texts';
import { API_BASE_URL } from '@/lib/api';
import {
  type OgMetaForShare,
  waitForFacebookShareMeta,
} from '@/lib/facebook-share-ready';
import {
  nestSocialUploadVideo,
  type SocialPlatform,
} from '@/lib/nest-client';

export type ShareMenuProps = {
  title: string;
  url: string;
  onClose: () => void;
  onCopied?: () => void;
  /** Shorts / video inzerát — rozšířené sdílení na sociální sítě. */
  shorts?: {
    videoUrl?: string | null;
    shareDescription?: string | null;
    apiAccessToken?: string | null;
  };
  /** Přepíše odvození typu z URL (admin texty pro sdílení). */
  contentType?: ShareContentType;
};

const facebookShareUrl = (u: string) =>
  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`;

const SOCIAL_LINKS = {
  tiktok: 'https://www.tiktok.com/upload',
  instagram: 'https://www.instagram.com/',
  youtube: 'https://studio.youtube.com/',
  facebook: 'https://www.facebook.com/',
} as const;

async function handleNativeShare(title: string, url: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  try {
    await navigator.share({ title, url });
    return true;
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareMenu({
  title,
  url,
  onClose,
  onCopied,
  shorts,
  contentType,
}: ShareMenuProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPlatform, setBusyPlatform] = useState<SocialPlatform | null>(null);
  const [shareCopy, setShareCopy] = useState<{ title: string; description: string } | null>(
    null,
  );
  const [fbShareNotice, setFbShareNotice] = useState<string | null>(null);

  const videoUrl = shorts?.videoUrl?.trim() || null;

  const listingId = (() => {
    try {
      const path = new URL(url).pathname;
      const m = path.match(/\/(?:shorts|nemovitost)\/([^/?#]+)/i);
      return m?.[1] ?? null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!listingId || !API_BASE_URL) {
      setFbShareNotice(null);
      return;
    }
    let cancelled = false;
    const shareAs = url.includes('/shorts/') ? 'shorts' : 'classic';
    const fetchMeta = async (): Promise<OgMetaForShare | null> => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/properties/${encodeURIComponent(listingId)}/og-meta?shareAs=${shareAs}`,
          { cache: 'no-store', headers: { Accept: 'application/json' } },
        );
        if (!res.ok) return null;
        return (await res.json()) as OgMetaForShare;
      } catch {
        return null;
      }
    };

    void waitForFacebookShareMeta(fetchMeta).then(({ noImageWarning }) => {
      if (cancelled) return;
      if (noImageWarning) {
        setFbShareNotice(
          'Sdílím odkaz, náhledový obrázek se může doplnit později.',
        );
      } else {
        setFbShareNotice(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [listingId, url]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const texts = await fetchShareTextsClient();
      if (cancelled) return;
      const type = contentType ?? inferShareContentTypeFromUrl(url);
      setShareCopy(shareTextsForType(type, texts));
    })();
    return () => {
      cancelled = true;
    };
  }, [url, contentType]);

  const shareTitle = shareCopy?.title ?? title;
  const shareDescription = shareCopy?.description ?? shorts?.shareDescription ?? null;
  const postText = buildListingSharePostText({
    title: shareTitle,
    description: shareDescription,
    url,
  });
  const whatsappHref = whatsAppShareUrl({
    shareText: buildShareMessageText({
      title: shareTitle,
      description: shareDescription,
    }),
    url,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const notifyCopied = useCallback(() => {
    setNotice('Odkaz byl zkopírován. Pro nahrání videa přímo na sociální síť propojte účet.');
    onCopied?.();
  }, [onCopied]);

  const tryUpload = useCallback(
    async (platform: SocialPlatform, label: string) => {
      setError(null);
      setNotice(null);
      if (!videoUrl) {
        setError('Video není k dispozici.');
        return;
      }
      if (!shorts?.apiAccessToken) {
        setError(
          `Pro nahrání videa je nutné propojit účet ${label}. Stáhněte video a nahrajte ho ručně.`,
        );
        return;
      }
      setBusyPlatform(platform);
      const r = await nestSocialUploadVideo(shorts.apiAccessToken, platform, {
        videoUrl,
        title: shareTitle,
        description: postText,
        listingUrl: url,
      });
      setBusyPlatform(null);
      if (!r.ok) {
        setError(
          r.error ??
            `Pro nahrání videa je nutné propojit účet ${label}. Stáhněte video a nahrajte ručně.`,
        );
        return;
      }
      setNotice(`Video bylo odesláno na ${label}.`);
    },
    [postText, shareTitle, shorts?.apiAccessToken, url, videoUrl],
  );

  function downloadVideo() {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = 'shorts-video.mp4';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setNotice('Stahování videa bylo spuštěno. Poté ho nahrajte na sociální síť.');
  }

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
        <div className="max-h-[min(75dvh,32rem)] space-y-1 overflow-y-auto p-3 pb-6">
          {notice ? (
            <p className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
          {fbShareNotice ? (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {fbShareNotice}
            </p>
          ) : null}

          <button
            type="button"
            onClick={async () => {
              const ok = await handleNativeShare(shareTitle, url);
              if (ok) onClose();
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Share2 className="size-5 shrink-0 text-orange-600" />
            <span>Sdílet odkaz (systém)</span>
          </button>

          <button
            type="button"
            onClick={() => void copyText(url).then((ok) => ok && notifyCopied())}
            className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
          >
            <Link2 className="size-5 shrink-0 text-zinc-600" />
            <span>Kopírovat odkaz</span>
          </button>

          {videoUrl ? (
            <>
              <button
                type="button"
                onClick={() => void copyText(postText).then((ok) => ok && setNotice('Text příspěvku zkopírován.'))}
                className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
              >
                <FileText className="size-5 shrink-0 text-zinc-600" />
                <span>Kopírovat text příspěvku</span>
              </button>
              <button
                type="button"
                onClick={downloadVideo}
                className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
              >
                <Download className="size-5 shrink-0 text-zinc-600" />
                <span>Stáhnout video</span>
              </button>
            </>
          ) : null}

          <div className="rounded-2xl border border-zinc-200">
            <button
              type="button"
              onClick={() => {
                window.open(facebookShareUrl(url), '_blank', 'noopener,noreferrer');
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              <Facebook className="size-5 shrink-0 text-blue-600" />
              <span>Sdílet odkaz na Facebook</span>
            </button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center gap-3 border-t border-zinc-100 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              <WhatsAppIcon className="size-5 shrink-0 text-[#25D366]" />
              <span>WhatsApp</span>
            </a>
            <a
              href={facebookDebuggerUrl(url)}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center gap-3 border-t border-zinc-100 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              <RefreshCw className="size-5 shrink-0 text-zinc-600" />
              <span>Aktualizovat náhled Facebook</span>
            </a>
            {videoUrl ? (
              <button
                type="button"
                disabled={busyPlatform === 'facebook'}
                onClick={() => void tryUpload('facebook', 'Facebook')}
                className="flex w-full items-center gap-3 border-t border-zinc-100 px-4 py-3 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60"
              >
                <Facebook className="size-5 shrink-0 text-blue-600" />
                <span>{busyPlatform === 'facebook' ? 'Nahrávám…' : 'Nahrát na Facebook'}</span>
              </button>
            ) : null}
          </div>

          {videoUrl ? (
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-2">
              <p className="px-2 pb-2 pt-1 text-xs leading-relaxed text-zinc-500">
                TikTok, Instagram a YouTube neumožňují automatické nahrání videa bez propojení účtu
                a API. Můžete video stáhnout a otevřít platformu ručně.
              </p>
              {(
                [
                  ['tiktok', 'TikTok', Camera],
                  ['instagram', 'Instagram Reels', Camera],
                  ['youtube', 'YouTube Shorts', PlayCircle],
                ] as const
              ).map(([platform, label, Icon]) => (
                <div key={platform} className="flex flex-col gap-1 border-t border-zinc-100 pt-1 first:border-t-0">
                  <button
                    type="button"
                    disabled={busyPlatform === platform}
                    onClick={() => void tryUpload(platform, label)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-white disabled:opacity-60"
                  >
                    <Icon className="size-4 shrink-0 text-zinc-600" />
                    <span>{busyPlatform === platform ? 'Nahrávám…' : `Nahrát na ${label}`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.open(SOCIAL_LINKS[platform], '_blank', 'noopener,noreferrer');
                      setNotice(
                        `Otevřeno ${label}. Stáhněte video a nahrajte ho ručně, pokud není účet propojený.`,
                      );
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs text-zinc-600 hover:bg-white"
                  >
                    <ExternalLink className="size-3.5 shrink-0" />
                    <span>Otevřít {label === 'YouTube Shorts' ? 'YouTube Studio' : label}</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-2">
              <p className="px-2 pb-2 pt-1 text-xs font-medium text-zinc-500">
                Sociální sítě — kopírování odkazu
              </p>
              {(
                [
                  ['tiktok', 'TikTok', Link2],
                  ['instagram', 'Instagram', Camera],
                  ['youtube', 'YouTube', PlayCircle],
                ] as const
              ).map(([platform, label, Icon]) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => {
                    void copyText(url).then((ok) => ok && notifyCopied());
                    window.open(SOCIAL_LINKS[platform], '_blank', 'noopener,noreferrer');
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-white"
                >
                  <Icon className="size-4 shrink-0 text-zinc-600" />
                  <span>{label} — kopírovat odkaz a otevřít</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
