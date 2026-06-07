'use client';

import Link from 'next/link';

type Props = {
  videoUrl: string;
  title: string;
  backHref: string;
};

export function TipShortsPlayer({ videoUrl, title, backHref }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="absolute left-0 top-0 z-[60] p-3">
        <Link
          href={backHref}
          className="inline-flex rounded-full border border-white/30 bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-md"
        >
          ← Zpět
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-14">
        <video
          src={videoUrl}
          className="max-h-[85dvh] w-full max-w-md rounded-2xl object-contain"
          controls
          autoPlay
          playsInline
          title={title}
        />
      </div>
    </div>
  );
}
