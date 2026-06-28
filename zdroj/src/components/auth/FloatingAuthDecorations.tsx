'use client';

import type { AuthPortalPreviewItem } from '@/lib/auth-portal-preview';

type Props = {
  items: AuthPortalPreviewItem[];
};

type FloatSlot = {
  position: string;
  layer: 'back' | 'front';
};

/** Rozmístění po celé obrazovce — část prvků opticky překrývá formulář. */
const MOBILE_FLOAT_SLOTS: FloatSlot[] = [
  { position: 'left-[2%] top-[11%]', layer: 'back' },
  { position: 'right-[0%] top-[7%]', layer: 'front' },
  { position: 'left-[-5%] top-[34%]', layer: 'back' },
  { position: 'right-[-3%] top-[30%]', layer: 'front' },
  { position: 'left-[18%] top-[46%]', layer: 'front' },
  { position: 'right-[14%] top-[44%]', layer: 'back' },
  { position: 'left-[6%] bottom-[22%]', layer: 'back' },
  { position: 'right-[4%] bottom-[18%]', layer: 'front' },
];

const ROTATIONS = [-4, 3, -2, 5, -3, 2, -5, 4] as const;
const SCALES = [0.88, 0.95, 1, 0.92, 1.04, 0.9, 0.97, 1.02] as const;
const OPACITIES = [0.28, 0.38, 0.32, 0.42, 0.25, 0.36, 0.3, 0.4] as const;

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
        className={`flex items-center justify-center bg-gradient-to-br from-orange-400/30 to-violet-900/40 ${className}`}
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
  const delayClass = `auth-backdrop-float-delay-${(index % 4) + 1}`;
  const zClass = slot.layer === 'front' ? 'z-[15]' : 'z-[4]';

  const motionStyle = {
    '--auth-rotate': `${rotate}deg`,
    '--auth-scale': scale,
    '--auth-opacity': opacity,
    opacity,
  } as React.CSSProperties;

  if (item.kind === 'promo') {
    const size = index % 3 === 0 ? 'size-12' : index % 3 === 1 ? 'size-14' : 'size-[3.25rem]';
    return (
      <div
        className={`pointer-events-none absolute ${slot.position} ${zClass}`}
        aria-hidden
      >
        <div className={`${animClass} ${delayClass}`} style={motionStyle}>
          <div
            className={`${size} overflow-hidden rounded-full border border-white/35 bg-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.25)] ring-1 ring-white/20 backdrop-blur-sm`}
          >
            <DecorMedia item={item} className="size-full" />
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'short' || item.kind === 'story') {
    const width = index % 2 === 0 ? 'w-[3.25rem]' : 'w-[3.75rem]';
    return (
      <div
        className={`pointer-events-none absolute ${slot.position} ${zClass}`}
        aria-hidden
      >
        <div className={`${animClass} ${delayClass}`} style={motionStyle}>
          <div
            className={`relative aspect-[9/16] ${width} overflow-hidden rounded-xl border border-white/25 bg-black/20 shadow-[0_10px_28px_rgba(0,0,0,0.3)] ring-1 ring-white/15 backdrop-blur-[2px]`}
          >
            <DecorMedia item={item} className="absolute inset-0 size-full" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 pb-1.5 pt-4">
              <p className="truncate text-[8px] font-semibold text-white/80">{item.title}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'post' || item.kind === 'facebook') {
    const width = index % 2 === 0 ? 'w-[4.5rem]' : 'w-[5rem]';
    return (
      <div
        className={`pointer-events-none absolute ${slot.position} ${zClass}`}
        aria-hidden
      >
        <div className={`${animClass} ${delayClass}`} style={motionStyle}>
          <div
            className={`${width} overflow-hidden rounded-lg border border-white/20 bg-white/10 shadow-[0_8px_22px_rgba(0,0,0,0.28)] backdrop-blur-[3px]`}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              <DecorMedia item={item} className="size-full" />
            </div>
            <p className="truncate px-1.5 py-1 text-[7px] font-medium text-white/75">{item.subtitle}</p>
          </div>
        </div>
      </div>
    );
  }

  const width = index % 2 === 0 ? 'w-[5rem]' : 'w-[5.75rem]';
  return (
    <div
      className={`pointer-events-none absolute ${slot.position} ${zClass}`}
      aria-hidden
    >
      <div className={`${animClass} ${delayClass}`} style={motionStyle}>
        <div
          className={`${width} overflow-hidden rounded-xl border border-white/22 bg-black/15 shadow-[0_10px_26px_rgba(0,0,0,0.32)] ring-1 ring-white/12 backdrop-blur-[2px]`}
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            <DecorMedia item={item} className="size-full" />
          </div>
          <div className="space-y-0.5 px-1.5 py-1.5">
            <p className="truncate text-[8px] font-semibold text-white/85">{item.title}</p>
            <p className="truncate text-[7px] text-white/55">{item.subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Plovoucí náhledy portálu za a před přihlašovacím formulářem (mobil).
 * Všechny prvky jsou čistě dekorativní — pointer-events: none.
 */
export function FloatingAuthDecorations({ items }: Props) {
  const preview = items.slice(0, MOBILE_FLOAT_SLOTS.length);
  if (!preview.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden lg:hidden"
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
