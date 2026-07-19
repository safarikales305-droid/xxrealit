import type { MetaUrlFetchFn } from './meta-public-url-health.util';

export const FACEBOOK_CRAWLER_USER_AGENTS = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Facebot',
] as const;

export const GOOGLE_CRAWLER_USER_AGENT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

export type ParsedPageMeta = {
  canonical: string | null;
  robots: string | null;
  ogType: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogImageWidth: string | null;
  ogImageHeight: string | null;
  ogUrl: string | null;
  ogSiteName: string | null;
  ogLocale: string | null;
  ogVideo: string | null;
  ogVideoType: string | null;
  ogVideoWidth: string | null;
  ogVideoHeight: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  metaPixelIds: string[];
};

export type CrawlerProbeResult = {
  userAgent: string;
  httpStatus: number | null;
  finalUrl: string;
  redirects: Array<{ status: number; url: string }>;
  requiresLogin: boolean;
  ok: boolean;
  error: string | null;
};

export type MetaUrlDiagnosticsResult = {
  ok: boolean;
  url: string;
  finalUrl: string;
  httpStatus: number | null;
  redirects: Array<{ status: number; url: string }>;
  anonymousAccess: boolean;
  requiresLogin: boolean;
  indexable: boolean;
  canonical: string | null;
  canonicalHasQuery: boolean;
  robots: string | null;
  meta: ParsedPageMeta;
  ogImageReachable: boolean | null;
  ogImageHttpStatus: number | null;
  facebookCrawler: CrawlerProbeResult;
  googleCrawler: CrawlerProbeResult;
  errors: string[];
  warnings: string[];
  autoFixes: Array<{ key: string; label: string; action: string }>;
};

const MAX_REDIRECTS = 8;
const DEFAULT_TIMEOUT_MS = 15_000;

function isLoginPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path === '/login' || path.startsWith('/login/');
  } catch {
    return /\/login(?:\/|$|\?)/i.test(url);
  }
}

function extractMetaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`,
      'i',
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function extractCanonicalLink(html: string): string | null {
  const match = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  );
  if (match?.[1]?.trim()) return match[1].trim();
  const match2 = html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
  );
  return match2?.[1]?.trim() ?? null;
}

function extractPixelIds(html: string): string[] {
  const ids = new Set<string>();
  const patterns = [
    /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/gi,
    /connect\.facebook\.net\/en_US\/fbevents\.js[^"']*['"]\s*,\s*['"](\d+)['"]/gi,
    /"pixelId"\s*:\s*"(\d+)"/gi,
  ];
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      if (m[1]) ids.add(m[1]);
    }
  }
  return [...ids];
}

export function parsePageMetaFromHtml(html: string): ParsedPageMeta {
  return {
    canonical: extractCanonicalLink(html),
    robots: extractMetaContent(html, 'robots'),
    ogType: extractMetaContent(html, 'og:type'),
    ogTitle: extractMetaContent(html, 'og:title'),
    ogDescription: extractMetaContent(html, 'og:description'),
    ogImage: extractMetaContent(html, 'og:image'),
    ogImageWidth: extractMetaContent(html, 'og:image:width'),
    ogImageHeight: extractMetaContent(html, 'og:image:height'),
    ogUrl: extractMetaContent(html, 'og:url'),
    ogSiteName: extractMetaContent(html, 'og:site_name'),
    ogLocale: extractMetaContent(html, 'og:locale'),
    ogVideo: extractMetaContent(html, 'og:video'),
    ogVideoType: extractMetaContent(html, 'og:video:type'),
    ogVideoWidth: extractMetaContent(html, 'og:video:width'),
    ogVideoHeight: extractMetaContent(html, 'og:video:height'),
    twitterCard: extractMetaContent(html, 'twitter:card'),
    twitterTitle: extractMetaContent(html, 'twitter:title'),
    twitterDescription: extractMetaContent(html, 'twitter:description'),
    twitterImage: extractMetaContent(html, 'twitter:image'),
    metaPixelIds: extractPixelIds(html),
  };
}

function validateUrlInput(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  fetchFn: MetaUrlFetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function followRedirects(
  fetchFn: MetaUrlFetchFn,
  startUrl: string,
  init: RequestInit,
  timeoutMs: number,
  maxRedirects: number,
): Promise<{
  response: Response | null;
  finalUrl: string;
  redirects: Array<{ status: number; url: string }>;
  error: string | null;
}> {
  let currentUrl = startUrl;
  const redirects: Array<{ status: number; url: string }> = [];
  let response: Response | null = null;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    try {
      response = await fetchWithTimeout(fetchFn, currentUrl, init, timeoutMs);
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `Časový limit ${timeoutMs} ms vypršel.`
          : err instanceof Error
            ? err.message
            : 'Požadavek selhal.';
      return { response: null, finalUrl: currentUrl, redirects, error: message };
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return {
          response,
          finalUrl: currentUrl,
          redirects,
          error: `Redirect ${status} bez Location.`,
        };
      }
      const nextUrl = new URL(location, currentUrl).toString();
      redirects.push({ status, url: nextUrl });
      currentUrl = nextUrl;
      continue;
    }
    break;
  }

  if (redirects.length > maxRedirects) {
    return {
      response,
      finalUrl: currentUrl,
      redirects,
      error: `Příliš mnoho přesměrování (>${maxRedirects}).`,
    };
  }

  return { response, finalUrl: response?.url || currentUrl, redirects, error: null };
}

export async function probeCrawlerAccess(
  rawUrl: string,
  userAgent: string,
  options?: {
    fetchFn?: MetaUrlFetchFn;
    timeoutMs?: number;
    maxRedirects?: number;
  },
): Promise<CrawlerProbeResult> {
  const fetchFn = options?.fetchFn ?? fetch;
  const parsed = validateUrlInput(rawUrl);
  if (!parsed) {
    return {
      userAgent,
      httpStatus: null,
      finalUrl: rawUrl.trim(),
      redirects: [],
      requiresLogin: false,
      ok: false,
      error: 'Neplatná URL.',
    };
  }

  const { response, finalUrl, redirects, error } = await followRedirects(
    fetchFn,
    parsed.toString(),
    {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': userAgent,
      },
    },
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    options?.maxRedirects ?? MAX_REDIRECTS,
  );

  if (error) {
    return {
      userAgent,
      httpStatus: response?.status ?? null,
      finalUrl,
      redirects,
      requiresLogin: redirects.some((r) => isLoginPath(r.url)) || isLoginPath(finalUrl),
      ok: false,
      error,
    };
  }

  const httpStatus = response?.status ?? null;
  const requiresLogin =
    httpStatus === 401 ||
    httpStatus === 403 ||
    isLoginPath(finalUrl) ||
    redirects.some((step) => isLoginPath(step.url));

  return {
    userAgent,
    httpStatus,
    finalUrl,
    redirects,
    requiresLogin,
    ok: httpStatus === 200 && !requiresLogin,
    error:
      httpStatus !== 200
        ? `HTTP ${httpStatus}`
        : requiresLogin
          ? 'Přesměrování na login'
          : null,
  };
}

export function buildMetaUrlAutoFixes(
  meta: ParsedPageMeta,
  url: string,
): Array<{ key: string; label: string; action: string }> {
  const fixes: Array<{ key: string; label: string; action: string }> = [];
  if (!meta.ogTitle) {
    fixes.push({
      key: 'og_title',
      label: 'Chybí OG title',
      action: 'Vygenerovat og:title z názvu inzerátu v admin šablonách sdílení.',
    });
  }
  if (!meta.ogDescription) {
    fixes.push({
      key: 'og_description',
      label: 'Chybí OG description',
      action: 'Doplnit popis nemovitosti — použije se první odstavec nebo šablona.',
    });
  }
  if (!meta.ogImage) {
    fixes.push({
      key: 'og_image',
      label: 'Chybí OG image',
      action: 'Použít hlavní fotografii nebo první fotku z galerie.',
    });
  }
  if (!meta.ogVideo && url.includes('/shorts/')) {
    fixes.push({
      key: 'og_video',
      label: 'Chybí OG video',
      action: 'Přidat og:video z video URL inzerátu, nebo fallback na fotografii.',
    });
  }
  if (meta.canonical?.includes('?')) {
    fixes.push({
      key: 'canonical_query',
      label: 'Canonical obsahuje query parametry',
      action: 'Odstranit ?source= a další parametry z canonical URL.',
    });
  }
  return fixes;
}

export function emptyMetaUrlDiagnosticsResult(
  url: string,
  error: string,
): MetaUrlDiagnosticsResult {
  const trimmed = url.trim();
  return {
    ok: false,
    url: trimmed,
    finalUrl: trimmed,
    httpStatus: null,
    redirects: [],
    anonymousAccess: false,
    requiresLogin: false,
    indexable: false,
    canonical: null,
    canonicalHasQuery: false,
    robots: null,
    meta: {
      canonical: null,
      robots: null,
      ogType: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogImageWidth: null,
      ogImageHeight: null,
      ogUrl: null,
      ogSiteName: null,
      ogLocale: null,
      ogVideo: null,
      ogVideoType: null,
      ogVideoWidth: null,
      ogVideoHeight: null,
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
      metaPixelIds: [],
    },
    ogImageReachable: null,
    ogImageHttpStatus: null,
    facebookCrawler: {
      userAgent: FACEBOOK_CRAWLER_USER_AGENTS[0],
      httpStatus: null,
      finalUrl: trimmed,
      redirects: [],
      requiresLogin: false,
      ok: false,
      error,
    },
    googleCrawler: {
      userAgent: GOOGLE_CRAWLER_USER_AGENT,
      httpStatus: null,
      finalUrl: trimmed,
      redirects: [],
      requiresLogin: false,
      ok: false,
      error,
    },
    errors: [error],
    warnings: [],
    autoFixes: [],
  };
}

export async function runMetaUrlDiagnostics(
  rawUrl: string,
  options?: {
    fetchFn?: MetaUrlFetchFn;
    timeoutMs?: number;
    maxRedirects?: number;
  },
): Promise<MetaUrlDiagnosticsResult> {
  const fetchFn = options?.fetchFn ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options?.maxRedirects ?? MAX_REDIRECTS;
  const parsed = validateUrlInput(rawUrl);
  const base: MetaUrlDiagnosticsResult = {
    ok: false,
    url: rawUrl.trim(),
    finalUrl: rawUrl.trim(),
    httpStatus: null,
    redirects: [],
    anonymousAccess: false,
    requiresLogin: false,
    indexable: false,
    canonical: null,
    canonicalHasQuery: false,
    robots: null,
    meta: {
      canonical: null,
      robots: null,
      ogType: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogImageWidth: null,
      ogImageHeight: null,
      ogUrl: null,
      ogSiteName: null,
      ogLocale: null,
      ogVideo: null,
      ogVideoType: null,
      ogVideoWidth: null,
      ogVideoHeight: null,
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
      metaPixelIds: [],
    },
    ogImageReachable: null,
    ogImageHttpStatus: null,
    facebookCrawler: {
      userAgent: FACEBOOK_CRAWLER_USER_AGENTS[0],
      httpStatus: null,
      finalUrl: rawUrl.trim(),
      redirects: [],
      requiresLogin: false,
      ok: false,
      error: null,
    },
    googleCrawler: {
      userAgent: GOOGLE_CRAWLER_USER_AGENT,
      httpStatus: null,
      finalUrl: rawUrl.trim(),
      redirects: [],
      requiresLogin: false,
      ok: false,
      error: null,
    },
    errors: [],
    warnings: [],
    autoFixes: [],
  };

  if (!parsed) {
    return { ...base, errors: ['Neplatná nebo prázdná URL.'] };
  }

  const [standardProbe, facebookProbe, googleProbe] = await Promise.all([
    followRedirects(
      fetchFn,
      parsed.toString(),
      {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'XXREALIT-MetaUrlDiagnostics/1.0',
        },
      },
      timeoutMs,
      maxRedirects,
    ),
    probeCrawlerAccess(parsed.toString(), FACEBOOK_CRAWLER_USER_AGENTS[0], {
      fetchFn,
      timeoutMs,
      maxRedirects,
    }),
    probeCrawlerAccess(parsed.toString(), GOOGLE_CRAWLER_USER_AGENT, {
      fetchFn,
      timeoutMs,
      maxRedirects,
    }),
  ]);

  base.facebookCrawler = facebookProbe;
  base.googleCrawler = googleProbe;

  const { response, finalUrl, redirects, error } = standardProbe;
  base.finalUrl = finalUrl;
  base.redirects = redirects;

  if (error) {
    base.errors.push(error);
  }

  const httpStatus = response?.status ?? null;
  base.httpStatus = httpStatus;
  const requiresLogin =
    httpStatus === 401 ||
    httpStatus === 403 ||
    isLoginPath(finalUrl) ||
    redirects.some((step) => isLoginPath(step.url));
  base.requiresLogin = requiresLogin;

  if (httpStatus !== 200) {
    base.errors.push(`HTTP status ${httpStatus} (očekáváno 200).`);
  }
  if (requiresLogin) {
    base.errors.push('URL vyžaduje přihlášení nebo přesměrovává na /login.');
  }
  if (!facebookProbe.ok) {
    base.errors.push(
      `Facebook crawler: ${facebookProbe.error ?? 'nedostupná stránka'}.`,
    );
  }
  if (!googleProbe.ok) {
    base.warnings.push(
      `Google crawler: ${googleProbe.error ?? 'nedostupná stránka'}.`,
    );
  }

  const contentType = response?.headers.get('content-type') ?? '';
  if (contentType.includes('text/html') && response) {
    const html = await response.text().catch(() => '');
    if (html) {
      const meta = parsePageMetaFromHtml(html);
      base.meta = meta;
      base.canonical = meta.canonical;
      base.canonicalHasQuery = Boolean(meta.canonical?.includes('?'));
      base.robots = meta.robots;
      const robotsLower = (meta.robots ?? '').toLowerCase();
      base.indexable = !robotsLower.includes('noindex');
      if (!base.indexable) {
        base.errors.push('Stránka má robots noindex.');
      }
      if (base.canonicalHasQuery) {
        base.errors.push('Canonical URL obsahuje query parametry.');
      }
      if (!meta.ogTitle) base.errors.push('Chybí og:title.');
      if (!meta.ogDescription) base.errors.push('Chybí og:description.');
      if (!meta.ogImage) base.errors.push('Chybí og:image.');
      if (!meta.twitterCard) base.warnings.push('Chybí twitter:card.');
      if (meta.ogImage) {
        try {
          const imgRes = await fetchWithTimeout(
            fetchFn,
            meta.ogImage,
            { method: 'HEAD', redirect: 'follow' },
            timeoutMs,
          );
          base.ogImageHttpStatus = imgRes.status;
          base.ogImageReachable = imgRes.ok;
          if (!imgRes.ok) {
            base.errors.push(`og:image vrací HTTP ${imgRes.status}.`);
          }
        } catch {
          base.ogImageReachable = false;
          base.errors.push('og:image URL není dostupná.');
        }
      }
      base.autoFixes = buildMetaUrlAutoFixes(meta, parsed.toString());
    } else {
      base.errors.push('HTML odpověď je prázdná.');
    }
  } else if (httpStatus === 200) {
    base.errors.push('Odpověď není HTML.');
  }

  base.anonymousAccess = httpStatus === 200 && !requiresLogin;
  const hasOg = Boolean(base.meta.ogTitle && base.meta.ogDescription && base.meta.ogImage);
  base.ok =
    base.anonymousAccess &&
    base.indexable &&
    hasOg &&
    facebookProbe.ok &&
    base.errors.length === 0;

  return base;
}
