'use client';

import Link from 'next/link';
import { nestAbsoluteAssetUrl } from '@/lib/api';

type Props = {
  title: string;
  imageUrl: string;
  classicHref: string;
  backHref?: string;
};

export function ShortsImageFallback({ title, imageUrl, classicHref, backHref = '/' }: Props) {
  const src = nestAbsoluteAssetUrl(imageUrl);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="absolute left-0 top-0 z-[60] p-3">
        <Link
          href={backHref}
          className="inline-flex rounded-full border border-white/30 bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-md hover:bg-black/70"
        >
          ← Zpět
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 pb-8 pt-14">
        {src ? (
          <img
            src={src}
            alt={title}
            className="max-h-[70dvh] w-full max-w-lg rounded-xl object-contain"
          />
        ) : null}
        <p className="max-w-md text-center text-sm text-white/80">{title}</p>
        <p className="max-w-md text-center text-xs text-white/55">
          Video není k dispozici. Zobrazujeme náhled nemovitosti.
        </p>
        <Link
          href={classicHref}
          className="rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Otevřít detail inzerátu
        </Link>
      </div>
    </div>
  );
}
