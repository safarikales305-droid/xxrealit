'use client';

import {
  SHORTS_OVERLAY_STYLE_OPTIONS,
  applyStylePreset,
  createDefaultOverlaySettings,
  type ShortsOverlayAlignment,
  type ShortsOverlaySettings,
  type ShortsOverlayStyleKey,
} from '@/lib/shorts-overlay';

type Props = {
  settings: ShortsOverlaySettings;
  onChange: (next: ShortsOverlaySettings) => void;
  disabled?: boolean;
  showHeading?: boolean;
};

export function ShortsOverlaySettingsPanel({
  settings,
  onChange,
  disabled,
  showHeading = true,
}: Props) {
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
      {showHeading ? (
        <h3 className="text-sm font-semibold text-zinc-900">Nápis ve videu</h3>
      ) : null}

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
        <input
          type="checkbox"
          checked={settings.showOverlayText}
          disabled={disabled}
          onChange={(e) => onChange({ ...settings, showOverlayText: e.target.checked })}
        />
        Zapnout horní nápis
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
        <input
          type="checkbox"
          checked={settings.showLogo}
          disabled={disabled}
          onChange={(e) => onChange({ ...settings, showLogo: e.target.checked })}
        />
        Zapnout logo XXREALIT
      </label>

      <label className="block text-sm font-medium text-zinc-800">
        Text nápisu
        <input
          value={settings.overlayText}
          disabled={disabled || !settings.showOverlayText}
          onChange={(e) => onChange({ ...settings, overlayText: e.target.value.slice(0, 80) })}
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          placeholder="PRODEJ / PRONÁJEM / XXREALIT"
        />
      </label>

      <label className="block text-sm font-medium text-zinc-800">
        Styl / předvolba
        <select
          value={settings.overlayStyle}
          disabled={disabled}
          onChange={(e) =>
            onChange(applyStylePreset(settings, e.target.value as ShortsOverlayStyleKey))
          }
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          {SHORTS_OVERLAY_STYLE_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-800">
          Barva textu
          <input
            type="color"
            value={settings.overlayColor}
            disabled={disabled || !settings.showOverlayText}
            onChange={(e) => onChange({ ...settings, overlayColor: e.target.value })}
            className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-zinc-200 bg-white"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-800">
          Velikost textu
          <input
            type="range"
            min={28}
            max={64}
            value={settings.overlayFontSize}
            disabled={disabled || !settings.showOverlayText}
            onChange={(e) =>
              onChange({ ...settings, overlayFontSize: Number(e.target.value) })
            }
            className="mt-3 w-full"
          />
          <span className="text-xs text-zinc-500">{settings.overlayFontSize} px</span>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-800">Zarovnání</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['left', 'Vlevo'],
              ['center', 'Střed'],
              ['right', 'Vpravo'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${
                settings.overlayPosition === value
                  ? 'border-[#ff6a00] bg-orange-50 text-orange-900'
                  : 'border-zinc-200 bg-white text-zinc-700'
              }`}
            >
              <input
                type="radio"
                name="overlayPosition"
                value={value}
                className="sr-only"
                disabled={disabled}
                checked={settings.overlayPosition === value}
                onChange={() =>
                  onChange({ ...settings, overlayPosition: value as ShortsOverlayAlignment })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export { createDefaultOverlaySettings };
