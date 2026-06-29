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

export type ShortsOverlayConfig = {
  text: string;
  styleKey: ShortsOverlayStyleKey;
  fontFamily: string;
  textColor: string;
  fontSize: number;
  alignment: ShortsOverlayAlignment;
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

const STYLE_KEYS = new Set<string>(Object.keys(SHORTS_OVERLAY_STYLE_PRESETS));

export function isShortsOverlayStyleKey(v: string): v is ShortsOverlayStyleKey {
  return STYLE_KEYS.has(v);
}

export function resolveDefaultOverlayText(ctx: {
  offerType?: string | null;
  isTip?: boolean;
  isTiparTip?: boolean;
}): string {
  if (ctx.isTip || ctx.isTiparTip) return 'TIP NA NEMOVITOST';
  const ot = (ctx.offerType ?? '').trim().toLowerCase();
  if (ot.includes('pronájem') || ot.includes('pronajem') || ot === 'rent' || ot === 'pronajem') {
    return 'PRONÁJEM';
  }
  if (ot.includes('prodej') || ot === 'sale') return 'PRODEJ';
  return 'XXREALIT';
}

export function defaultStyleForOfferType(offerType?: string | null): ShortsOverlayStyleKey {
  const ot = (offerType ?? '').trim().toLowerCase();
  if (ot.includes('pronájem') || ot.includes('pronajem') || ot === 'rent') return 'rental';
  if (ot.includes('prodej') || ot === 'sale') return 'sale';
  return 'modern_real_estate';
}

export function normalizeOverlayAlignment(raw: unknown): ShortsOverlayAlignment {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'left' || v === 'right' || v === 'center') return v;
  return 'center';
}

export function buildShortsOverlayConfig(input: {
  overlayText?: string | null;
  overlayStyle?: string | null;
  overlayFont?: string | null;
  overlayColor?: string | null;
  overlayFontSize?: number | null;
  overlayPosition?: string | null;
  showLogo?: boolean | null;
  showOverlayText?: boolean | null;
  offerType?: string | null;
  isTip?: boolean;
  isTiparTip?: boolean;
}): ShortsOverlayConfig {
  const styleKey: ShortsOverlayStyleKey = isShortsOverlayStyleKey(input.overlayStyle ?? '')
    ? (input.overlayStyle as ShortsOverlayStyleKey)
    : defaultStyleForOfferType(input.offerType);
  const preset = SHORTS_OVERLAY_STYLE_PRESETS[styleKey];
  const text =
    (input.overlayText ?? '').trim() ||
    resolveDefaultOverlayText({
      offerType: input.offerType,
      isTip: input.isTip,
      isTiparTip: input.isTiparTip,
    });
  return {
    text: text.slice(0, 80),
    styleKey,
    fontFamily: (input.overlayFont ?? '').trim() || preset.fontFamily,
    textColor: (input.overlayColor ?? '').trim() || preset.textColor,
    fontSize:
      typeof input.overlayFontSize === 'number' &&
      Number.isFinite(input.overlayFontSize) &&
      input.overlayFontSize >= 24 &&
      input.overlayFontSize <= 72
        ? Math.round(input.overlayFontSize)
        : preset.fontSize,
    alignment: normalizeOverlayAlignment(input.overlayPosition),
    showLogo: input.showLogo !== false,
    showOverlayText: input.showOverlayText !== false,
  };
}

export function overlayFieldsForStorage(input: {
  overlayText?: string | null;
  overlayStyle?: string | null;
  overlayFont?: string | null;
  overlayColor?: string | null;
  overlayFontSize?: number | null;
  overlayPosition?: string | null;
  showLogo?: boolean | null;
  showOverlayText?: boolean | null;
  offerType?: string | null;
  isTip?: boolean;
  isTiparTip?: boolean;
}) {
  const cfg = buildShortsOverlayConfig(input);
  return {
    overlayText: (input.overlayText ?? '').trim() || cfg.text,
    overlayStyle: cfg.styleKey,
    overlayFont: (input.overlayFont ?? '').trim() || cfg.fontFamily,
    overlayColor: (input.overlayColor ?? '').trim() || cfg.textColor,
    overlayFontSize: cfg.fontSize,
    overlayPosition: cfg.alignment,
    showLogo: input.showLogo !== false,
    showOverlayText: input.showOverlayText !== false,
  };
}

export function overlayConfigFromProperty(p: {
  overlayText?: string | null;
  overlayStyle?: string | null;
  overlayFont?: string | null;
  overlayColor?: string | null;
  overlayFontSize?: number | null;
  overlayPosition?: string | null;
  showLogo?: boolean | null;
  showOverlayText?: boolean | null;
  offerType?: string | null;
  isTiparTip?: boolean | null;
}): ShortsOverlayConfig {
  return buildShortsOverlayConfig({
    overlayText: p.overlayText,
    overlayStyle: p.overlayStyle,
    overlayFont: p.overlayFont,
    overlayColor: p.overlayColor,
    overlayFontSize: p.overlayFontSize ?? undefined,
    overlayPosition: p.overlayPosition,
    showLogo: p.showLogo,
    showOverlayText: p.showOverlayText,
    offerType: p.offerType,
    isTiparTip: p.isTiparTip === true,
  });
}
