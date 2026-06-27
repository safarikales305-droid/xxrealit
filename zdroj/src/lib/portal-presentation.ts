import { API_BASE_URL } from '@/lib/api';

export type PortalPresentationSection = {
  id: string;
  anchor: string;
  sectionType: string;
  sortOrder: number;
  isVisible: boolean;
  icon: string | null;
  title: string;
  subtitle: string | null;
  bodyHtml: string;
  imageUrl: string | null;
  galleryUrls: string[];
  videoUrl: string | null;
  youtubeUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  accentColor: string | null;
  bgStyle: string;
  updatedAt: string;
};

export type PortalPresentationFaq = {
  id: string;
  question: string;
  answerHtml: string;
  sortOrder: number;
};

export type PortalPresentationPage = {
  id: string;
  locale: string;
  slug: string;
  isPublished: boolean;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string | null;
  heroCtaUrl: string | null;
  heroSecondaryCtaLabel: string | null;
  heroSecondaryCtaUrl: string | null;
  heroImageUrl: string | null;
  heroVideoUrl: string | null;
  heroGradientFrom: string;
  heroGradientTo: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  publishedAt: string | null;
  updatedAt: string;
  sections: PortalPresentationSection[];
  faq: PortalPresentationFaq[];
  supportedLocales: string[];
};

function apiBase(): string | null {
  if (!API_BASE_URL) return null;
  return API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
}

export async function fetchPortalPresentation(locale = 'cs'): Promise<PortalPresentationPage | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/portal-presentation/public?locale=${encodeURIComponent(locale)}`, {
      next: { revalidate: 60 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as PortalPresentationPage | null;
  } catch {
    return null;
  }
}

export async function searchPortalPresentation(
  q: string,
  locale = 'cs',
): Promise<Array<{ type: string; title: string; anchor: string; excerpt: string }>> {
  const base = apiBase();
  if (!base || q.trim().length < 2) return [];
  try {
    const res = await fetch(
      `${base}/portal-presentation/search?q=${encodeURIComponent(q)}&locale=${encodeURIComponent(locale)}`,
      { cache: 'no-store', headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Array<{ type: string; title: string; anchor: string; excerpt: string }> };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export const PRESENTATION_LOCALES = [
  { code: 'cs', label: 'Čeština' },
  { code: 'sk', label: 'Slovenčina' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pl', label: 'Polski' },
] as const;
