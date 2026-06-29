export type ShortsOverlayAlignment = 'left' | 'center' | 'right';

export type ShortsOverlayStyleKey =
  | 'modern_real_estate'
  | 'luxury'
  | 'minimal'
  | 'bold_orange'
  | 'elegant_bw'
  | 'developer'
  | 'rental'
  | 'sale';

export type ShortsOverlayStylePreset = {
  key: ShortsOverlayStyleKey;
  label: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  labelBackground: string;
  labelBackgroundOpacity: number;
  shadowColor: string;
  shadowOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  textOpacity: number;
};

export type ShortsOverlaySettings = {
  overlayText: string;
  overlayStyle: ShortsOverlayStyleKey;
  overlayFont: string;
  overlayColor: string;
  overlayFontSize: number;
  overlayPosition: ShortsOverlayAlignment;
  showLogo: boolean;
  showOverlayText: boolean;
};

export const SHORTS_OVERLAY_STYLE_PRESETS: Record<ShortsOverlayStyleKey, ShortsOverlayStylePreset> = {
  modern_real_estate: {
    key: 'modern_real_estate',
    label: 'Moderní realitní',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    fontSize: 48,
    fontWeight: 700,
    textColor: '#FFFFFF',
    labelBackground: '#0F172A',
    labelBackgroundOpacity: 0.72,
    shadowColor: '#000000',
    shadowOpacity: 0.55,
    outlineColor: '#000000',
    outlineWidth: 2,
    textOpacity: 1,
  },
  luxury: {
    key: 'luxury',
    label: 'Luxusní',
    fontFamily: 'Georgia, Times New Roman, serif',
    fontSize: 46,
    fontWeight: 700,
    textColor: '#F5E6C8',
    labelBackground: '#1A1208',
    labelBackgroundOpacity: 0.78,
    shadowColor: '#000000',
    shadowOpacity: 0.65,
    outlineColor: '#8B6914',
    outlineWidth: 1,
    textOpacity: 1,
  },
  minimal: {
    key: 'minimal',
    label: 'Minimalistický',
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
    fontSize: 42,
    fontWeight: 600,
    textColor: '#111827',
    labelBackground: '#FFFFFF',
    labelBackgroundOpacity: 0.88,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    outlineColor: '#FFFFFF',
    outlineWidth: 0,
    textOpacity: 1,
  },
  bold_orange: {
    key: 'bold_orange',
    label: 'Výrazný oranžový',
    fontFamily: 'Arial Black, Arial, sans-serif',
    fontSize: 50,
    fontWeight: 900,
    textColor: '#FFFFFF',
    labelBackground: '#FF6A00',
    labelBackgroundOpacity: 0.92,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    outlineColor: '#7C2D00',
    outlineWidth: 2,
    textOpacity: 1,
  },
  elegant_bw: {
    key: 'elegant_bw',
    label: 'Černobílý elegantní',
    fontFamily: 'Georgia, serif',
    fontSize: 44,
    fontWeight: 700,
    textColor: '#FFFFFF',
    labelBackground: '#000000',
    labelBackgroundOpacity: 0.82,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    outlineColor: '#FFFFFF',
    outlineWidth: 1,
    textOpacity: 1,
  },
  developer: {
    key: 'developer',
    label: 'Developerský projekt',
    fontFamily: 'Trebuchet MS, Arial, sans-serif',
    fontSize: 46,
    fontWeight: 700,
    textColor: '#E0F2FE',
    labelBackground: '#0C4A6E',
    labelBackgroundOpacity: 0.85,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    outlineColor: '#0369A1',
    outlineWidth: 1,
    textOpacity: 1,
  },
  rental: {
    key: 'rental',
    label: 'Pronájem',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    fontSize: 48,
    fontWeight: 700,
    textColor: '#FFFFFF',
    labelBackground: '#047857',
    labelBackgroundOpacity: 0.88,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    outlineColor: '#064E3B',
    outlineWidth: 2,
    textOpacity: 1,
  },
  sale: {
    key: 'sale',
    label: 'Prodej',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    fontSize: 48,
    fontWeight: 700,
    textColor: '#FFFFFF',
    labelBackground: '#B45309',
    labelBackgroundOpacity: 0.9,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    outlineColor: '#78350F',
    outlineWidth: 2,
    textOpacity: 1,
  },
};

export const SHORTS_OVERLAY_STYLE_OPTIONS = Object.values(SHORTS_OVERLAY_STYLE_PRESETS);

export function resolveDefaultOverlayText(ctx: {
  offerType?: string;
  isTip?: boolean;
}): string {
  if (ctx.isTip) return 'TIP NA NEMOVITOST';
  const ot = (ctx.offerType ?? '').trim().toLowerCase();
  if (ot.includes('pronájem') || ot.includes('pronajem') || ot === 'rent') return 'PRONÁJEM';
  if (ot.includes('prodej') || ot === 'sale') return 'PRODEJ';
  return 'XXREALIT';
}

export function defaultStyleForOfferType(offerType?: string): ShortsOverlayStyleKey {
  const ot = (offerType ?? '').trim().toLowerCase();
  if (ot.includes('pronájem') || ot.includes('pronajem') || ot === 'rent') return 'rental';
  if (ot.includes('prodej') || ot === 'sale') return 'sale';
  return 'modern_real_estate';
}

export function createDefaultOverlaySettings(ctx: {
  offerType?: string;
  isTip?: boolean;
}): ShortsOverlaySettings {
  const style = defaultStyleForOfferType(ctx.offerType);
  const preset = SHORTS_OVERLAY_STYLE_PRESETS[style];
  return {
    overlayText: resolveDefaultOverlayText(ctx),
    overlayStyle: style,
    overlayFont: preset.fontFamily,
    overlayColor: preset.textColor,
    overlayFontSize: preset.fontSize,
    overlayPosition: 'center',
    showLogo: true,
    showOverlayText: true,
  };
}

export function presetForSettings(settings: ShortsOverlaySettings): ShortsOverlayStylePreset {
  return SHORTS_OVERLAY_STYLE_PRESETS[settings.overlayStyle] ?? SHORTS_OVERLAY_STYLE_PRESETS.modern_real_estate;
}

export function applyStylePreset(
  settings: ShortsOverlaySettings,
  styleKey: ShortsOverlayStyleKey,
): ShortsOverlaySettings {
  const preset = SHORTS_OVERLAY_STYLE_PRESETS[styleKey];
  return {
    ...settings,
    overlayStyle: styleKey,
    overlayFont: preset.fontFamily,
    overlayColor: preset.textColor,
    overlayFontSize: preset.fontSize,
  };
}

export function appendOverlayToFormData(fd: FormData, settings: ShortsOverlaySettings): void {
  fd.append('overlayText', settings.overlayText);
  fd.append('overlayStyle', settings.overlayStyle);
  fd.append('overlayFont', settings.overlayFont);
  fd.append('overlayColor', settings.overlayColor);
  fd.append('overlayFontSize', String(settings.overlayFontSize));
  fd.append('overlayPosition', settings.overlayPosition);
  fd.append('showLogo', String(settings.showLogo));
  fd.append('showOverlayText', String(settings.showOverlayText));
}
