'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuthPortalPreviewItem } from '@/lib/auth-portal-preview';
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

function StoryPreviewCard({
  item,
  onOpenGate,
}: {
  item: AuthPortalPreviewItem;
  onOpenGate: () => void;
}) {
  const media = item.videoUrl || item.coverUrl;

  return (
    <button
      type="button"
      onClick={onOpenGate}
      aria-label={item.title}
      className="relative h-full w-auto shrink-0 aspect-[9/16] max-h-full overflow-hidden rounded-[0.65rem] border border-zinc-200/90 bg-zinc-900 ring-1 ring-zinc-900/10"
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
    </button>
  );
}

/**
 * Kompaktní horizontální stories carousel — pevná výška, statické náhledy bez animací.
 */
export function AuthMobileStoriesPreview({ items, variant = 'login' }: Props) {
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
    <section
      className="mx-auto mt-3 w-full shrink-0 lg:hidden"
      aria-label="Náhled portálu"
    >
      <div className="h-[clamp(140px,min(24dvh,180px),180px)] max-h-[180px] min-h-[140px] overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50/90 to-white shadow-inner shadow-zinc-100/50">
        <div className="no-scrollbar flex h-full items-stretch gap-2.5 overflow-x-auto overflow-y-hidden px-2.5 py-2.5">
          {preview.map((item) => (
            <StoryPreviewCard key={item.id} item={item} onOpenGate={openGate} />
          ))}
        </div>
      </div>
      {variant === 'login' ? (
        <p className="mt-1.5 text-center text-[10px] leading-snug text-zinc-500 sm:text-[11px]">
          Klepněte na náhled a zaregistrujte se
        </p>
      ) : null}
    </section>
  );
}
