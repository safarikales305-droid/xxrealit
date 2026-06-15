'use client';

import type { AuthPortalPreviewItem } from '@/lib/auth-portal-preview';

type Props = {
  items: AuthPortalPreviewItem[];
};

function DesktopPreviewCard({ item }: { item: AuthPortalPreviewItem }) {
  const media = item.videoUrl || item.coverUrl;

  return (
    <div
      className={`pointer-events-none absolute z-[1] ${item.positionClass ?? 'hidden lg:block'}`}
      aria-hidden
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-[0_24px_60px_-14px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-sm">
        {item.kind === 'short' || item.kind === 'story' ? (
          <div className="relative aspect-[9/16] w-[4.75rem] sm:w-[5.5rem] md:w-[6.25rem]">
            {item.videoUrl ? (
              <video
                src={item.videoUrl}
                muted
                playsInline
                loop
                autoPlay
                preload="metadata"
                className="absolute inset-0 size-full object-cover opacity-80"
              />
            ) : media ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media} alt="" className="absolute inset-0 size-full object-cover opacity-80" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/30 to-violet-900/40" />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-2 pt-5">
              <p className="truncate text-[9px] font-semibold text-white">{item.title}</p>
            </div>
          </div>
        ) : (
          <div className="w-[9.5rem] sm:w-[10.5rem] md:w-[11.5rem]">
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              {item.videoUrl ? (
                <video
                  src={item.videoUrl}
                  muted
                  playsInline
                  loop
                  autoPlay
                  preload="metadata"
                  className="size-full object-cover opacity-75"
                />
              ) : media ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media} alt="" className="size-full object-cover opacity-75" />
              ) : (
                <div className="size-full bg-gradient-to-br from-amber-100/20 to-slate-900/80" />
              )}
            </div>
            <div className="space-y-0.5 px-2.5 py-2">
              <p className="truncate text-[11px] font-semibold text-white/90">{item.title}</p>
              <p className="truncate text-[10px] text-white/55">{item.subtitle}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AuthDesktopLiveBackdrop({ items }: Props) {
  return (
    <>
      {items.map((item) => (
        <DesktopPreviewCard key={`desktop-${item.id}`} item={item} />
      ))}
      <div
        className="pointer-events-none absolute inset-0 z-[2] bg-slate-950/55 backdrop-blur-[1.5px]"
        aria-hidden
      />
    </>
  );
}
