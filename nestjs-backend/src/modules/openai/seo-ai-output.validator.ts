export type SeoAiOutput = {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  introText: string;
  mainContent: string;
  faq: Array<{ question: string; answer: string }>;
};

const FORBIDDEN_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /https?:\/\//i,
  /www\./i,
];

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function isSafeText(value: string): boolean {
  return !FORBIDDEN_PATTERNS.some((p) => p.test(value));
}

export function validateSeoAiOutput(raw: unknown): { ok: true; data: SeoAiOutput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Výstup není platný JSON objekt.'] };
  }
  const o = raw as Record<string, unknown>;

  const metaTitle = stripHtml(String(o.metaTitle ?? ''));
  const metaDescription = stripHtml(String(o.metaDescription ?? ''));
  const h1 = stripHtml(String(o.h1 ?? ''));
  const introText = stripHtml(String(o.introText ?? ''));
  const mainContent = stripHtml(String(o.mainContent ?? ''));

  if (!metaTitle || metaTitle.length < 10) errors.push('Meta Title je příliš krátký.');
  if (metaTitle.length > 70) errors.push('Meta Title je příliš dlouhý (max. 70 znaků).');
  if (!metaDescription || metaDescription.length < 80) errors.push('Meta Description je příliš krátký.');
  if (metaDescription.length > 170) errors.push('Meta Description je příliš dlouhý (max. 170 znaků).');
  if (!h1.trim()) errors.push('Chybí H1.');
  if (!introText || introText.length < 50) errors.push('Úvodní text je příliš krátký.');
  if (!mainContent || mainContent.length < 200) errors.push('Hlavní obsah je příliš krátký.');

  for (const field of [metaTitle, metaDescription, h1, introText, mainContent]) {
    if (!isSafeText(field)) errors.push('Text obsahuje nepovolené prvky (HTML, skripty nebo externí odkazy).');
  }

  const faqRaw = o.faq;
  if (!Array.isArray(faqRaw) || faqRaw.length < 3) {
    errors.push('FAQ musí obsahovat alespoň 3 položky.');
  }

  const faq: Array<{ question: string; answer: string }> = [];
  if (Array.isArray(faqRaw)) {
    for (const item of faqRaw.slice(0, 20)) {
      if (!item || typeof item !== 'object') continue;
      const q = stripHtml(String((item as { question?: string }).question ?? ''));
      const a = stripHtml(String((item as { answer?: string }).answer ?? ''));
      if (!q || !a) continue;
      if (!isSafeText(q) || !isSafeText(a)) {
        errors.push('FAQ obsahuje nepovolené prvky.');
        break;
      }
      faq.push({ question: q, answer: a });
    }
  }
  if (faq.length < 3) errors.push('FAQ musí obsahovat alespoň 3 platné otázky a odpovědi.');

  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  return {
    ok: true,
    data: { metaTitle, metaDescription, h1, introText, mainContent, faq },
  };
}

export function parseSeoAiJson(text: string): unknown {
  const trimmed = text.trim();
  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = jsonBlock ? jsonBlock[1].trim() : trimmed;
  return JSON.parse(candidate);
}
