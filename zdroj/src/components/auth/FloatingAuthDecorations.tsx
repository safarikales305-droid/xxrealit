'use client';

import type { AuthPortalPreviewItem } from '@/lib/auth-portal-preview';

type Props = {
  items: AuthPortalPreviewItem[];
};

type FloatSlot = {
  position: string;
  drift: 'left' | 'right';
  parallax: 'near' | 'mid' | 'far';
};

/** Pozice v rámci horní zóny (logo + nadpis) — nezasahují do polí formuláře. */
const MOBILE_FLOAT_SLOTS: FloatSlot[] = [
  { position: 'left-[2%] top-[4%]', drift: 'left', parallax: 'far' },
  { position: 'right-[0%] top-[2%]', drift: 'right', parallax: 'mid' },
  { position: 'left-[18%] top-[28%]', drift: 'left', parallax: 'near' },
  { position: 'right-[16%] top-[24%]', drift: 'right', parallax: 'far' },
  { position: 'left-[0%] top-[52%]', drift: 'left', parallax: 'mid' },
  { position: 'right-[2%] top-[48%]', drift: 'right', parallax: 'near' },
  { position: 'left-[32%] top-[68%]', drift: 'left', parallax: 'far' },
  { position: 'right-[28%] top-[72%]', drift: 'right', parallax: 'mid' },
];

const ROTATIONS = [-7, 5, -4, 8, -5, 4, -8, 6] as const;
const SCALES = [0.82, 0.94, 1.08, 0.88, 1.12, 0.86, 1.02, 0.96] as const;
const OPACITIES = [0.38, 0.52, 0.42, 0.58, 0.34, 0.48, 0.4, 0.55] as const;

const PARALLAX_CLASS = {
  near: 'auth-float-parallax-near',
  mid: 'auth-float-parallax-mid',
  far: 'auth-float-parallax-far',
} as const;

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
  const parallaxClass = PARALLAX_CLASS[slot.parallax];
  const depthClass = index % 3 === 0 ? 'z-[2]' : index % 3 === 1 ? 'z-[4]' : 'z-[6]';

  const motionStyle = {
    '--auth-rotate': `${rotate}deg`,
    '--auth-scale': scale,
    '--auth-opacity': opacity,
    opacity,
  } as React.CSSProperties;

  const shellClass = `pointer-events-none absolute ${slot.position} ${depthClass}`;
  const glowClass =
    'shadow-[0_0_22px_rgba(249,115,22,0.22),0_12px_32px_rgba(0,0,0,0.28)]';

  if (item.kind === 'promo') {
    const size = index % 3 === 0 ? 'size-11' : index % 3 === 1 ? 'size-14' : 'size-[4.25rem]';
    return (
      <div className={shellClass} aria-hidden>
        <div className={`${animClass} ${driftClass} ${parallaxClass} ${delayClass}`} style={motionStyle}>
          <div
            className={`${size} overflow-hidden rounded-full border border-white/45 bg-white/15 ${glowClass} ring-1 ring-white/30 backdrop-blur-md`}
          >
            <DecorMedia item={item} className="size-full blur-[0.3px]" />
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'short' || item.kind === 'story') {
    const width = index % 2 === 0 ? 'w-[3.25rem]' : 'w-[4.25rem]';
    return (
      <div className={shellClass} aria-hidden>
        <div className={`${animClass} ${driftClass} ${parallaxClass} ${delayClass}`} style={motionStyle}>
          <div
            className={`relative aspect-[9/16] ${width} overflow-hidden rounded-xl border border-white/35 bg-black/25 ${glowClass} ring-1 ring-white/25 backdrop-blur-sm`}
          >
            <DecorMedia item={item} className="absolute inset-0 size-full blur-[0.4px]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1.5 pt-4">
              <p className="truncate text-[8px] font-semibold text-white/85">{item.title}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'post' || item.kind === 'facebook') {
    const width = index % 2 === 0 ? 'w-[4.5rem]' : 'w-[5.5rem]';
    return (
      <div className={shellClass} aria-hidden>
        <div className={`${animClass} ${driftClass} ${parallaxClass} ${delayClass}`} style={motionStyle}>
          <div
            className={`${width} overflow-hidden rounded-lg border border-white/30 bg-white/12 ${glowClass} backdrop-blur-md`}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              <DecorMedia item={item} className="size-full blur-[0.35px]" />
            </div>
            <p className="truncate px-1.5 py-1 text-[7px] font-medium text-white/80">{item.subtitle}</p>
          </div>
        </div>
      </div>
    );
  }

  const width = index % 2 === 0 ? 'w-[5rem]' : 'w-[5.75rem]';
  return (
    <div className={shellClass} aria-hidden>
      <div className={`${animClass} ${driftClass} ${parallaxClass} ${delayClass}`} style={motionStyle}>
        <div
          className={`${width} overflow-hidden rounded-xl border border-white/30 bg-black/20 ${glowClass} ring-1 ring-white/20 backdrop-blur-sm`}
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            <DecorMedia item={item} className="size-full blur-[0.35px]" />
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
 * Dekorace nad logem a nadpisem (mobil). pointer-events: none — formulář zůstává plně ovladatelný.
 */
export function FloatingAuthDecorations({ items }: Props) {
  const preview = items.slice(0, MOBILE_FLOAT_SLOTS.length);
  if (!preview.length) return null;

  return (
    <div
      className="auth-float-overlay pointer-events-none absolute inset-0 z-[20] overflow-visible lg:hidden"
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
