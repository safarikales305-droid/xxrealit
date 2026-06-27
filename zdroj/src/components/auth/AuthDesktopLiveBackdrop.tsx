'use client';

import type { AuthPortalPreviewItem } from '@/lib/auth-portal-preview';

type Props = {
  items: AuthPortalPreviewItem[];
};

const ROTATIONS = [-3, 2, -4, 3, -2, 4, -3, 2] as const;
const SCALES = [0.92, 1, 1.08, 0.96, 1.12, 1.04, 0.88, 1.1] as const;
const DELAYS = [
  '',
  'auth-backdrop-float-delay-1',
  'auth-backdrop-float-delay-2',
  'auth-backdrop-float-delay-3',
  'auth-backdrop-float-delay-4',
  'auth-backdrop-float-delay-2',
  'auth-backdrop-float-delay-3',
  'auth-backdrop-float-delay-1',
] as const;

function sizeClass(kind: AuthPortalPreviewItem['kind'], index: number): string {
  const tier = index % 4;
  if (kind === 'promo') {
    return ['size-[4.5rem]', 'size-[5.5rem]', 'size-[6.25rem]', 'size-[5rem]'][tier]!;
  }
  if (kind === 'short' || kind === 'story') {
    return ['w-[5rem]', 'w-[6.25rem]', 'w-[7rem]', 'w-[5.75rem]'][tier]!;
  }
  return ['w-[9rem]', 'w-[11rem]', 'w-[12.5rem]', 'w-[10.25rem]'][tier]!;
}

function DesktopPreviewCard({ item, index }: { item: AuthPortalPreviewItem; index: number }) {
  const media = item.videoUrl || item.coverUrl;
  const rotate = ROTATIONS[index % ROTATIONS.length];
  const scale = SCALES[index % SCALES.length];
  const delay = DELAYS[index % DELAYS.length];
  const animClass = index % 2 === 0 ? 'auth-backdrop-float' : 'auth-backdrop-float-slow';

  const motionStyle = {
    '--auth-rotate': `${rotate}deg`,
    '--auth-scale': scale,
    '--auth-opacity': '0.88',
  } as React.CSSProperties;

  if (item.kind === 'promo') {
    const avatarSize = sizeClass('promo', index);
    return (
      <div
        className={`pointer-events-none absolute z-[1] ${item.positionClass ?? 'hidden lg:block'}`}
        aria-hidden
      >
        <div
          className={`${animClass} ${delay} flex flex-col items-center gap-2`}
          style={motionStyle}
        >
          <div
            className={`${avatarSize} overflow-hidden rounded-full border-2 border-white/25 bg-zinc-800 shadow-[0_16px_40px_rgba(0,0,0,0.35)] ring-2 ring-orange-400/35`}
          >
            {media ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center bg-gradient-to-br from-orange-500/40 to-violet-900/50 text-white">
                ?
              </div>
            )}
          </div>
          <p className="max-w-[6rem] truncate text-center text-[10px] font-semibold text-white/90">
            {item.subtitle}
          </p>
        </div>
      </div>
    );
  }

  const cardWidth = sizeClass(item.kind, index);

  return (
    <div
      className={`pointer-events-none absolute z-[1] ${item.positionClass ?? 'hidden lg:block'}`}
      aria-hidden
    >
      <div className={`${animClass} ${delay}`} style={motionStyle}>
        <div className="overflow-hidden rounded-2xl border border-white/15 bg-black/35 shadow-[0_24px_60px_-14px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
          {item.kind === 'short' || item.kind === 'story' ? (
            <div className={`relative aspect-[9/16] ${cardWidth}`}>
              {item.videoUrl ? (
                <video
                  src={item.videoUrl}
                  muted
                  playsInline
                  loop
                  autoPlay
                  preload="metadata"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : media ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/30 to-violet-900/40" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2.5 pt-6">
                <p className="truncate text-[10px] font-semibold text-white">{item.title}</p>
              </div>
            </div>
          ) : (
            <div className={cardWidth}>
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                {item.videoUrl ? (
                  <video
                    src={item.videoUrl}
                    muted
                    playsInline
                    loop
                    autoPlay
                    preload="metadata"
                    className="size-full object-cover"
                  />
                ) : media ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media} alt="" className="size-full object-cover" />
                ) : (
                  <div className="size-full bg-gradient-to-br from-amber-100/20 to-slate-900/80" />
                )}
              </div>
              <div className="space-y-0.5 px-2.5 py-2.5">
                <p className="truncate text-[11px] font-semibold text-white/95">{item.title}</p>
                <p className="truncate text-[10px] text-white/60">{item.subtitle}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthDesktopLiveBackdrop({ items }: Props) {
  return (
    <>
      {items.map((item, index) => (
        <DesktopPreviewCard key={`desktop-${item.id}`} item={item} index={index} />
      ))}
      <div
        className="pointer-events-none absolute inset-0 z-[2] hidden bg-slate-950/28 backdrop-blur-[4px] lg:block"
        aria-hidden
      />
    </>
  );
}
