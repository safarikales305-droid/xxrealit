import type { CompanyDirectoryCategory, CompanyReviewSentiment } from '@prisma/client';

export function formatCzechReviewCount(count: number): string {
  if (count === 1) return '1 recenze';
  if (count >= 2 && count <= 4) return `${count} recenze`;
  return `${count} recenzí`;
}

export function formatStarRating(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export function formatRatingValue(average: number | null | undefined, fallbackRating?: number): string {
  const value = average ?? fallbackRating ?? 0;
  return value.toFixed(1);
}

export function categoryReviewHashtag(category?: CompanyDirectoryCategory | null): string | null {
  switch (category) {
    case 'STAVEBNICTVI':
      return '#Stavebnictvi';
    case 'REALITY':
      return '#RealitniSluzby';
    case 'FINANCE':
    case 'HYPOTEKA':
      return '#Finance';
    case 'REMESLA':
      return '#Remesla';
    case 'ARCHITEKTURA':
    case 'PROJEKTOVANI':
      return '#Architektura';
    case 'DEVELOPMENT':
      return '#Development';
    default:
      return null;
  }
}

export function sentimentLabel(sentiment: CompanyReviewSentiment): string {
  if (sentiment === 'POSITIVE') return 'Pozitivní';
  if (sentiment === 'NEGATIVE') return 'Negativní';
  return 'Neutrální';
}

export function pickFacebookIntroVariant(seed: string): 'A' | 'B' | 'C' | 'D' {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % 4;
  }
  return (['A', 'B', 'C', 'D'] as const)[hash];
}

export function buildCompanyReviewFacebookMessage(input: {
  companyName: string;
  companyProfileUrl: string;
  reviewExcerpt: string;
  averageRating: number | null;
  reviewCount: number;
  singleReviewRating: number;
  sentiment: CompanyReviewSentiment;
  categoryHashtag?: string | null;
  variantSeed: string;
}): string {
  const stars = formatStarRating(input.singleReviewRating);
  const avg = formatRatingValue(input.averageRating, input.singleReviewRating);
  const countLabel = formatCzechReviewCount(input.reviewCount);
  const excerpt = input.reviewExcerpt.trim().slice(0, 220);
  const hashtag = input.categoryHashtag?.trim() ? `\n${input.categoryHashtag.trim()}` : '\n#XXREALIT\n#RecenzeFirem';
  const variant = pickFacebookIntroVariant(input.variantSeed);

  const headline =
    variant === 'A'
      ? '⭐ Nová recenze na XXREALIT'
      : variant === 'B'
        ? '💬 Zákazník přidal novou zkušenost s firmou'
        : variant === 'C'
          ? `Jak si vede ${input.companyName}? Přibyla nová recenze.`
          : `Nové hodnocení firmy ${input.companyName} na XXREALIT.`;

  const intro =
    input.sentiment === 'NEGATIVE'
      ? 'Na profilu firmy přibyla nová zákaznická zkušenost.'
      : headline;

  return [
    intro,
    '',
    `Firma:\n${input.companyName}`,
    '',
    `${stars} ${avg} / 5`,
    '',
    `Firma má aktuálně ${countLabel} na XXREALIT.`,
    '',
    excerpt ? `Nová zkušenost zákazníka:\n\n„${excerpt}"` : null,
    '',
    `👉 Podívejte se, jak si firma vede, přečtěte si všechny recenze a zobrazte její profil na XXREALIT:\n${input.companyProfileUrl}`,
    hashtag,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function buildCompanyReviewPortalContent(input: {
  companyName: string;
  companyProfileUrl: string;
  reviewExcerpt: string;
  averageRating: number | null;
  reviewCount: number;
  singleReviewRating: number;
  positiveCount: number;
  negativeCount: number;
}): { title: string; description: string; content: string } {
  const stars = formatStarRating(input.singleReviewRating);
  const avg = formatRatingValue(input.averageRating, input.singleReviewRating);
  const countLabel = formatCzechReviewCount(input.reviewCount);
  const excerpt = input.reviewExcerpt.trim().slice(0, 280);

  const title = `⭐ Nová recenze firmy ${input.companyName}`;
  const description = `${stars} ${avg} · ${countLabel} na XXREALIT`;
  const content = [
    '⭐ NOVÁ RECENZE FIRMY',
    '',
    input.companyName,
    '',
    `${stars} ${avg}`,
    countLabel,
    '',
    excerpt ? `„${excerpt}"` : '',
    '',
    `Pozitivní: ${input.positiveCount}`,
    `Negativní: ${input.negativeCount}`,
    '',
    `Zobrazit profil firmy: ${input.companyProfileUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { title, description, content };
}

export function buildCompanyReviewEmailBody(input: {
  companyName: string;
  companyProfileUrl: string;
  reviewUrl: string;
  claimUrl: string;
  manageUrl: string;
  reviewExcerpt: string;
  averageRating: number | null;
  reviewCount: number;
  singleReviewRating: number;
  sentiment: CompanyReviewSentiment;
  isClaimed: boolean;
}): string {
  const stars = formatStarRating(input.singleReviewRating);
  const avg = formatRatingValue(input.averageRating, input.singleReviewRating);
  const countLabel = formatCzechReviewCount(input.reviewCount);

  return [
    'Dobrý den,',
    '',
    'na portálu XXREALIT byla zveřejněna nová recenze společnosti:',
    '',
    input.companyName,
    '',
    'Nové hodnocení:',
    `${stars} ${avg} / 5`,
    '',
    `Celkem recenzí: ${countLabel}`,
    '',
    `Typ zkušenosti: ${sentimentLabel(input.sentiment)}`,
    '',
    'Krátký úryvek recenze:',
    '',
    `„${input.reviewExcerpt.trim().slice(0, 220)}"`,
    '',
    'Podívejte se, jak si vaše firma vede na XXREALIT.',
    '',
    `Zobrazit profil a recenzi: ${input.reviewUrl}`,
    '',
    input.isClaimed
      ? `Spravovat profil: ${input.manageUrl}`
      : `Převzít / upravit profil firmy: ${input.claimUrl}`,
  ].join('\n');
}
