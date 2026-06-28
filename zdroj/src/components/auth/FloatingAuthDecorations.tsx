'use client';

import type { AuthPortalPreviewItem } from '@/lib/auth-portal-preview';

type Props = {
  items: AuthPortalPreviewItem[];
};

type FloatSlot = {
  position: string;
  /** Směr jemného „odplutí“ při focusu formuláře */
  drift: 'left' | 'right';
};

/**
 * Pozice přes celou obrazovku včetně středu — karty přejíždí přes formulář.
 * Kontejner je nad formulářem (z-30), kliky projdou díky pointer-events: none.
 */
const MOBILE_FLOAT_SLOTS: FloatSlot[] = [
  { position: 'left-[6%] top-[16%]', drift: 'left' },
  { position: 'right-[4%] top-[12%]', drift: 'right' },
  { position: 'left-[28%] top-[32%]', drift: 'left' },
  { position: 'right-[22%] top-[30%]', drift: 'right' },
  { position: 'left-[2%] top-[48%]', drift: 'left' },
  { position: 'right-[0%] top-[46%]', drift: 'right' },
  { position: 'left-[20%] top-[62%]', drift: 'left' },
  { position: 'right-[14%] top-[66%]', drift: 'right' },
];

const ROTATIONS = [-5, 4, -3, 6, -4, 3, -6, 5] as const;
const SCALES = [0.9, 0.96, 1.02, 0.94, 1.05, 0.92, 0.98, 1.04] as const;
const OPACITIES = [0.32, 0.45, 0.38, 0.52, 0.28, 0.42, 0.35, 0.48] as const;

function DecorMedia({
  item,
  className,
}: {
  item: AuthPortalPreviewItem;
  className: string;
}) {
  const media = item.coverUrl || item.videoUrl;
  if (!media) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-orange-400/35 to-violet-900/45 ${className}`}
      >
        <span className="text-[9px] font-bold text-white/60">XX</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media} alt="" className={`object-cover ${className}`} loading="lazy" decoding="async" />
  );
}

function FloatingDecorItem({
  item,
  index,
  slot,
}: {
  item: AuthPortalPreviewItem;
  index: number;
  slot: FloatSlot;
}) {
  const rotate = ROTATIONS[index % ROTATIONS.length];
  const scale = SCALES[index % SCALES.length];
  const opacity = OPACITIES[index % OPACITIES.length];
  const animClass = index % 2 === 0 ? 'auth-float-gentle' : 'auth-float-gentle-slow';
  const driftClass = slot.drift === 'left' ? 'auth-float-drift-left' : 'auth-float-drift-right';
  const delayClass = `auth-backdrop-float-delay-${(index % 4) + 1}`;
  const depthClass = index % 3 === 0 ? 'z-[2]' : index % 3 === 1 ? 'z-[4]' : 'z-[6]';

  const motionStyle = {
    '--auth-rotate': `${rotate}deg`,
    '--auth-scale': scale,
    '--auth-opacity': opacity,
    opacity,
  } as React.CSSProperties;

  const shellClass = `pointer-events-none absolute ${slot.position} ${depthClass}`;

  if (item.kind === 'promo') {
    const size = index % 3 === 0 ? 'size-12' : index % 3 === 1 ? 'size-14' : 'size-16';
    return (
      <div className={shellClass} aria-hidden>
        <div className={`${animClass} ${driftClass} ${delayClass}`} style={motionStyle}>
          <div
            className={`${size} overflow-hidden rounded-full border border-white/40 bg-white/15 shadow-[0_10px_28px_rgba(0,0,0,0.28)] ring-1 ring-white/25 backdrop-blur-md`}
          >
            <DecorMedia item={item} className="size-full" />
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'short' || item.kind === 'story') {
    const width = index % 2 === 0 ? 'w-[3.5rem]' : 'w-[4rem]';
    return (
      <div className={shellClass} aria-hidden>
        <div className={`${animClass} ${driftClass} ${delayClass}`} style={motionStyle}>
          <div
            className={`relative aspect-[9/16] ${width} overflow-hidden rounded-xl border border-white/30 bg-black/25 shadow-[0_12px_32px_rgba(0,0,0,0.32)] ring-1 ring-white/20 backdrop-blur-sm`}
          >
            <DecorMedia item={item} className="absolute inset-0 size-full" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1.5 pt-4">
              <p className="truncate text-[8px] font-semibold text-white/85">{item.title}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'post' || item.kind === 'facebook') {
    const width = index % 2 === 0 ? 'w-[4.75rem]' : 'w-[5.25rem]';
    return (
      <div className={shellClass} aria-hidden>
        <div className={`${animClass} ${driftClass} ${delayClass}`} style={motionStyle}>
          <div
            className={`${width} overflow-hidden rounded-lg border border-white/25 bg-white/12 shadow-[0_10px_26px_rgba(0,0,0,0.3)] backdrop-blur-md`}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              <DecorMedia item={item} className="size-full" />
            </div>
            <p className="truncate px-1.5 py-1 text-[7px] font-medium text-white/80">{item.subtitle}</p>
          </div>
        </div>
      </div>
    );
  }

  const width = index % 2 === 0 ? 'w-[5.25rem]' : 'w-[6rem]';
  return (
    <div className={shellClass} aria-hidden>
      <div className={`${animClass} ${driftClass} ${delayClass}`} style={motionStyle}>
        <div
          className={`${width} overflow-hidden rounded-xl border border-white/28 bg-black/20 shadow-[0_12px_30px_rgba(0,0,0,0.34)] ring-1 ring-white/18 backdrop-blur-sm`}
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            <DecorMedia item={item} className="size-full" />
          </div>
          <div className="space-y-0.5 px-1.5 py-1.5">
            <p className="truncate text-[8px] font-semibold text-white/90">{item.title}</p>
            <p className="truncate text-[7px] text-white/60">{item.subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dekorativní vrstva nad přihlašovacím formulářem (mobil).
 * pointer-events: none — formulář pod ní zůstává plně použitelný.
 */
export function FloatingAuthDecorations({ items }: Props) {
  const preview = items.slice(0, MOBILE_FLOAT_SLOTS.length);
  if (!preview.length) return null;

  return (
    <div
      className="auth-float-overlay pointer-events-none fixed inset-0 z-[30] overflow-hidden lg:hidden"
      aria-hidden
    >
      {preview.map((item, index) => (
        <FloatingDecorItem
          key={item.id}
          item={item}
          index={index}
          slot={MOBILE_FLOAT_SLOTS[index % MOBILE_FLOAT_SLOTS.length]!}
        />
      ))}
    </div>
  );
}
