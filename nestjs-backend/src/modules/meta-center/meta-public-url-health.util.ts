export type MetaPublicUrlRedirectStep = {
  status: number;
  url: string;
};

export type MetaPublicUrlOpenGraph = {
  title: boolean;
  description: boolean;
  image: boolean;
};

export type MetaPublicUrlHealthResult = {
  ok: boolean;
  url: string;
  finalUrl: string;
  httpStatus: number | null;
  redirects: MetaPublicUrlRedirectStep[];
  anonymousAccess: boolean;
  requiresLogin: boolean;
  indexable: boolean;
  hasOpenGraph: boolean;
  openGraph: MetaPublicUrlOpenGraph;
  errors: string[];
};

export type MetaUrlFetchFn = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

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

function parseOpenGraphFromHtml(html: string): MetaPublicUrlOpenGraph {
  const title = Boolean(
    extractMetaContent(html, 'og:title') || extractMetaContent(html, 'twitter:title'),
  );
  const description = Boolean(
    extractMetaContent(html, 'og:description') ||
      extractMetaContent(html, 'description') ||
      extractMetaContent(html, 'twitter:description'),
  );
  const image = Boolean(
    extractMetaContent(html, 'og:image') || extractMetaContent(html, 'twitter:image'),
  );
  return { title, description, image };
}

function isNoIndexHtml(html: string): boolean {
  const robots = extractMetaContent(html, 'robots')?.toLowerCase() ?? '';
  return robots.includes('noindex');
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

export async function probeMetaPublicUrl(
  rawUrl: string,
  options?: {
    fetchFn?: MetaUrlFetchFn;
    timeoutMs?: number;
    maxRedirects?: number;
  },
): Promise<MetaPublicUrlHealthResult> {
  const fetchFn = options?.fetchFn ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options?.maxRedirects ?? MAX_REDIRECTS;
  const parsed = validateUrlInput(rawUrl);
  const baseResult: MetaPublicUrlHealthResult = {
    ok: false,
    url: rawUrl.trim(),
    finalUrl: rawUrl.trim(),
    httpStatus: null,
    redirects: [],
    anonymousAccess: false,
    requiresLogin: false,
    indexable: false,
    hasOpenGraph: false,
    openGraph: { title: false, description: false, image: false },
    errors: [],
  };

  if (!parsed) {
    return {
      ...baseResult,
      errors: ['Neplatná nebo prázdná URL (povolené jsou pouze http/https).'],
    };
  }

  let currentUrl = parsed.toString();
  const redirects: MetaPublicUrlRedirectStep[] = [];
  let response: Response | null = null;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    try {
      response = await fetchWithTimeout(
        fetchFn,
        currentUrl,
        {
          method: 'GET',
          redirect: 'manual',
          headers: {
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'XXREALIT-MetaUrlHealth/1.0',
          },
        },
        timeoutMs,
      );
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `Časový limit ${timeoutMs} ms vypršel.`
          : err instanceof Error
            ? err.message
            : 'Požadavek na URL selhal.';
      return { ...baseResult, finalUrl: currentUrl, redirects, errors: [message] };
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return {
          ...baseResult,
          finalUrl: currentUrl,
          httpStatus: status,
          redirects,
          errors: [`Redirect ${status} bez hlavičky Location.`],
        };
      }
      const nextUrl = new URL(location, currentUrl).toString();
      redirects.push({ status, url: nextUrl });
      currentUrl = nextUrl;
      continue;
    }
    break;
  }

  if (!response) {
    return {
      ...baseResult,
      finalUrl: currentUrl,
      redirects,
      errors: ['Nepodařilo se načíst odpověď URL.'],
    };
  }

  if (redirects.length > maxRedirects) {
    return {
      ...baseResult,
      finalUrl: currentUrl,
      httpStatus: response.status,
      redirects,
      errors: [`Příliš mnoho přesměrování (>${maxRedirects}).`],
    };
  }

  const httpStatus = response.status;
  const finalUrl = response.url || currentUrl;
  const requiresLogin =
    httpStatus === 401 ||
    httpStatus === 403 ||
    isLoginPath(finalUrl) ||
    redirects.some((step) => isLoginPath(step.url));
  const errors: string[] = [];

  if (httpStatus !== 200) {
    errors.push(`HTTP status ${httpStatus} (očekáváno 200).`);
  }
  if (requiresLogin) {
    errors.push('URL vyžaduje přihlášení nebo přesměrovává na /login.');
  }

  let openGraph: MetaPublicUrlOpenGraph = {
    title: false,
    description: false,
    image: false,
  };
  let indexable = true;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    const html = await response.text().catch(() => '');
    if (html) {
      openGraph = parseOpenGraphFromHtml(html);
      if (isNoIndexHtml(html)) {
        indexable = false;
        errors.push('Stránka má meta robots noindex.');
      }
      if (!openGraph.title) {
        errors.push('Chybí Open Graph title (og:title).');
      }
      if (!openGraph.description) {
        errors.push('Chybí Open Graph description (og:description).');
      }
      if (!openGraph.image) {
        errors.push('Chybí Open Graph obrázek (og:image).');
      }
    } else {
      errors.push('HTML odpověď je prázdná.');
    }
  } else if (httpStatus === 200) {
    errors.push('Odpověď není HTML — nelze ověřit Open Graph tagy.');
  }

  const hasOpenGraph =
    openGraph.title && openGraph.description && openGraph.image;
  const anonymousAccess = httpStatus === 200 && !requiresLogin;
  const ok = anonymousAccess && indexable && hasOpenGraph && errors.length === 0;

  return {
    ok,
    url: parsed.toString(),
    finalUrl,
    httpStatus,
    redirects,
    anonymousAccess,
    requiresLogin,
    indexable,
    hasOpenGraph,
    openGraph,
    errors,
  };
}
