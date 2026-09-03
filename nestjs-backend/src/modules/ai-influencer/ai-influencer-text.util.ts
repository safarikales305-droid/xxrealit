import type { AiInfluencerAutomationSettings } from './ai-influencer.types';

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number.parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

export function normalizeArticleTitle(title: string): string {
  return decodeHtmlEntities(title)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeArticleTitle(a).split(' ').filter((w) => w.length > 2));
  const wb = new Set(normalizeArticleTitle(b).split(' ').filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / Math.max(wa.size, wb.size);
}

export function applyBrandTtsSubstitution(
  text: string,
  settings: Pick<AiInfluencerAutomationSettings, 'brandDisplayName' | 'brandTtsPronunciation'>,
): string {
  const brand = settings.brandDisplayName || 'XXREALIT';
  const pronunciation = settings.brandTtsPronunciation || 'iks iks realit';
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), pronunciation);
}

export function ensureBrandMention(
  spokenText: string,
  settings: Pick<
    AiInfluencerAutomationSettings,
    | 'spokenBrandingEnabled'
    | 'brandDisplayName'
    | 'introTemplate'
    | 'outroTemplate'
    | 'spokenBrandingMode'
  >,
): string {
  if (!settings.spokenBrandingEnabled) return spokenText;
  const brand = settings.brandDisplayName || 'XXREALIT';
  if (spokenText.toLowerCase().includes(brand.toLowerCase())) return spokenText;

  const mode = settings.spokenBrandingMode ?? 'AUTO';
  if (mode === 'OFF') return spokenText;

  const intro = settings.introTemplate?.trim() || `Vítejte u ${brand}.`;
  const outro =
    settings.outroTemplate?.trim() ||
    `Sledujte ${brand} pro další novinky ze světa realit a bydlení.`;

  if (mode === 'INTRO') return `${intro} ${spokenText}`;
  if (mode === 'OUTRO') return `${spokenText} ${outro}`;
  if (mode === 'INTRO_AND_OUTRO') return `${intro} ${spokenText} ${outro}`;
  return `${spokenText} Sledujte ${brand} pro další informace.`;
}

export function isWithinPragueWindow(start: string, end: string, now = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const current = hour * 60 + minute;
  const [sh, sm] = start.split(':').map((x) => Number.parseInt(x, 10));
  const [eh, em] = end.split(':').map((x) => Number.parseInt(x, 10));
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return current >= startMin && current <= endMin;
}
