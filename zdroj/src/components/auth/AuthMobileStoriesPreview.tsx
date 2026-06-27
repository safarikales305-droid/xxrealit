'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MOBILE_BACKDROP_POSITIONS,
  type AuthPortalPreviewItem,
} from '@/lib/auth-portal-preview';
import type { AuthShellVariant } from '@/components/auth/auth-page-shell';
import { openGuestRegistrationGate } from '@/lib/guest-registration-gate-store';
import {
  buildAuthPortalGateSettings,
  fetchRegistrationGateSettingsRaw,
  type PublicRegistrationGateSettings,
} from '@/lib/registration-gate';

type Props = {
  items: AuthPortalPreviewItem[];
  variant?: AuthShellVariant;
};

const ROTATIONS = [2, -3, 3, -2, 4, -4, 2, -3] as const;
const OPACITIES = [0.35, 0.42, 0.38, 0.48, 0.32, 0.45, 0.4, 0.36] as const;
const SCALES = [0.9, 1, 1.05, 0.95, 1.08, 0.92, 1.02, 0.88] as const;

function MobilePreviewCard({
  item,
  index,
  onOpenGate,
}: {
  item: AuthPortalPreviewItem;
  index: number;
  onOpenGate: () => void;
}) {
  const media = item.videoUrl || item.coverUrl;
  const position = MOBILE_BACKDROP_POSITIONS[index % MOBILE_BACKDROP_POSITIONS.length];
  const rotate = ROTATIONS[index % ROTATIONS.length];
  const opacity = OPACITIES[index % OPACITIES.length];
  const scale = SCALES[index % SCALES.length];
  const animClass = item.kind === 'promo' ? 'auth-backdrop-float' : 'auth-backdrop-float-slow';
  const delayClass = `auth-backdrop-float-delay-${(index % 4) + 1}`;

  const motionStyle = {
    '--auth-rotate': `${rotate}deg`,
    '--auth-scale': scale,
    '--auth-opacity': opacity,
    opacity,
  } as React.CSSProperties;

  if (item.kind === 'promo') {
    const size = index % 3 === 0 ? 'size-14' : index % 3 === 1 ? 'size-16' : 'size-[3.75rem]';
    return (
      <button
        type="button"
        onClick={onOpenGate}
        aria-label={item.subtitle}
        className={`pointer-events-auto absolute ${position} z-[5] lg:hidden`}
      >
        <div
          className={`${animClass} ${delayClass} flex flex-col items-center gap-1`}
          style={motionStyle}
        >
          <div
            className={`${size} overflow-hidden rounded-full border-2 border-white/40 bg-zinc-100 shadow-lg ring-2 ring-orange-300/50`}
          >
            {media ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-xs font-bold text-orange-600">
                ?
              </span>
            )}
          </div>
        </div>
      </button>
    );
  }

  const width =
    item.kind === 'short' || item.kind === 'story'
      ? index % 3 === 0
        ? 'w-[3.25rem]'
        : index % 3 === 1
          ? 'w-[4rem]'
          : 'w-[3.5rem]'
      : index % 2 === 0
        ? 'w-[5.5rem]'
        : 'w-[6.25rem]';

  return (
    <button
      type="button"
      onClick={onOpenGate}
      aria-label={item.title}
      className={`pointer-events-auto absolute ${position} z-[5] lg:hidden`}
    >
      <div className={`${animClass} ${delayClass}`} style={motionStyle}>
        {item.kind === 'short' || item.kind === 'story' ? (
          <div
            className={`relative aspect-[9/16] ${width} overflow-hidden rounded-xl border border-white/30 bg-zinc-900 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-1 ring-white/20`}
          >
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
              <span className="flex size-full items-center justify-center text-[10px] font-bold text-white/70">
                XX
              </span>
            )}
          </div>
        ) : (
          <div
            className={`${width} overflow-hidden rounded-xl border border-white/25 bg-zinc-900 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-1 ring-white/15`}
          >
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
                <span className="flex size-full items-center justify-center text-[10px] font-bold text-white/70">
                  XX
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Ostré živé náhledy po okrajích mobilní obrazovky — zůstávají viditelné při scrollu.
 */
export function AuthMobileStoriesPreview({ items, variant: _variant = 'login' }: Props) {
  const preview = items.slice(0, 12);
  const [gateSettings, setGateSettings] = useState<PublicRegistrationGateSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchRegistrationGateSettingsRaw().then((raw) => {
      if (!cancelled) setGateSettings(buildAuthPortalGateSettings(raw));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openGate = useCallback(() => {
    const settings = gateSettings ?? buildAuthPortalGateSettings(null);
    openGuestRegistrationGate(settings);
  }, [gateSettings]);

  if (!preview.length) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-[5] overflow-hidden lg:hidden"
        aria-hidden
      >
        {preview.map((item, index) => (
          <MobilePreviewCard key={item.id} item={item} index={index} onOpenGate={openGate} />
        ))}
      </div>
    </>
  );
}
