'use client';

import { PortalLogoImage } from '@/components/PortalLogoImage';
import {
  presetForSettings,
  type ShortsOverlaySettings,
} from '@/lib/shorts-overlay';

const PREVIEW_WIDTH = 270;
const PREVIEW_HEIGHT = 480;
const SCALE = PREVIEW_WIDTH / 720;

type Props = {
  previewImageUrl: string | null;
  settings: ShortsOverlaySettings;
};

export function ShortsOverlayPreview({ previewImageUrl, settings }: Props) {
  const preset = presetForSettings(settings);
  const barTop = Math.round(48 * SCALE);
  const barHeight = Math.round(108 * SCALE);
  const barLeft = Math.round(16 * SCALE);
  const barWidth = PREVIEW_WIDTH - barLeft * 2;
  const fontSize = Math.max(12, Math.round(settings.overlayFontSize * SCALE * 0.55));
  const textAlign =
    settings.overlayPosition === 'left'
      ? 'left'
      : settings.overlayPosition === 'right'
        ? 'right'
        : 'center';

  return (
    <div className="mx-auto w-full max-w-[270px]">
      <div
        className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900 shadow-lg"
        style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
      >
        {previewImageUrl ? (
          <img
            src={previewImageUrl}
            alt="Náhled fotky"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-800 text-xs text-zinc-400">
            Přidejte fotky pro náhled
          </div>
        )}

        {(settings.showLogo || settings.showOverlayText) && (
          <div
            className="absolute flex items-center gap-2 px-2"
            style={{
              top: barTop,
              left: barLeft,
              width: barWidth,
              height: barHeight,
              borderRadius: Math.round(14 * SCALE),
              backgroundColor: preset.labelBackground,
              opacity: preset.labelBackgroundOpacity,
            }}
          >
            {settings.showLogo ? (
              <div className="shrink-0 rounded bg-white/90 px-1 py-0.5">
                <PortalLogoImage className="h-5 w-auto max-w-[72px] object-contain" />
              </div>
            ) : null}
            {settings.showOverlayText ? (
              <p
                className="min-w-0 flex-1 truncate font-bold leading-tight"
                style={{
                  fontFamily: settings.overlayFont || preset.fontFamily,
                  fontSize,
                  fontWeight: preset.fontWeight,
                  color: settings.overlayColor || preset.textColor,
                  textAlign,
                  textShadow: `1px 1px 2px rgba(0,0,0,${preset.shadowOpacity})`,
                  WebkitTextStroke:
                    preset.outlineWidth > 0 ? `${Math.max(1, preset.outlineWidth * SCALE * 0.5)}px ${preset.outlineColor}` : undefined,
                }}
              >
                {settings.overlayText || 'XXREALIT'}
              </p>
            ) : null}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/25 to-transparent" />
        <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/80">
          9:16 náhled
        </div>
      </div>
    </div>
  );
}
