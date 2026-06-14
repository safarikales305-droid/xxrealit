'use client';

import { useEffect, useRef, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';

type Props = {
  embedUrl: string;
  fallbackUrl: string;
  fallbackImage?: string | null;
  postType?: string | null;
  compact?: boolean;
};

export function FacebookEmbedCard({
  embedUrl,
  fallbackUrl,
  fallbackImage,
  postType,
  compact = false,
}: Props) {
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<number | null>(null);
  const isVideo = postType === 'FACEBOOK_VIDEO' || postType === 'FACEBOOK_REEL';
  const imageSrc = fallbackImage ? nestAbsoluteAssetUrl(fallbackImage) : null;

  useEffect(() => {
    setFailed(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setFailed(true), 12_000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [embedUrl]);

  function handleLoad() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setFailed(false);
  }

  if (failed) {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-[#1877F2]/25 bg-zinc-900 ${
          compact ? 'min-h-[200px]' : 'min-h-[260px]'
        }`}
      >
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt="" className="h-full min-h-[220px] w-full object-cover opacity-80" />
        ) : (
          <div className="flex min-h-[220px] items-center justify-center bg-gradient-to-br from-[#1877F2]/40 via-[#1877F2]/20 to-zinc-900">
            <span className="text-5xl text-white/90">f</span>
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 p-4 text-center">
          <p className="text-sm font-medium text-white">
            {isVideo ? 'Video z Facebooku' : 'Příspěvek z Facebooku'}
          </p>
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#166fe0]"
          >
            {isVideo ? 'Přehrát na Facebooku' : 'Otevřít na Facebooku'}
          </a>
        </div>
      </div>
    );
  }

  const minHeight = isVideo ? (compact ? 320 : 420) : compact ? 380 : 500;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[#1877F2]/15 bg-zinc-50">
      <iframe
        src={embedUrl}
        title="Facebook příspěvek"
        className="w-full border-0"
        style={{ minHeight }}
        scrolling="no"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
        onLoad={handleLoad}
      />
    </div>
  );
}
