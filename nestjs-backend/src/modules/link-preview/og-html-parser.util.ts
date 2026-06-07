function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function extractMeta(html: string, key: string, attr: 'property' | 'name'): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decodeHtmlEntities(m[1].trim());
  }
  return null;
}

function extractTitle(html: string): string | null {
  const og = extractMeta(html, 'og:title', 'property');
  if (og) return og;
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim() ? decodeHtmlEntities(m[1].trim()) : null;
}

function extractCanonical(html: string, baseUrl: string): string | null {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) {
      try {
        return new URL(m[1].trim(), baseUrl).href;
      } catch {
        return m[1].trim();
      }
    }
  }
  return null;
}

function extractFirstImage(html: string, baseUrl: string): string | null {
  const og = extractMeta(html, 'og:image', 'property');
  if (og) {
    try {
      return new URL(og, baseUrl).href;
    } catch {
      return og;
    }
  }
  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(html)) !== null) {
    const src = match[1]?.trim();
    if (!src || src.startsWith('data:')) continue;
    if (/logo|icon|favicon|sprite|pixel|tracking|1x1/i.test(src)) continue;
    try {
      const abs = new URL(src, baseUrl).href;
      if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(abs) || /\/image|\/photo|\/foto/i.test(abs)) {
        return abs;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function siteNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    const parts = host.split('.');
    if (parts.length >= 2) {
      const name = parts[parts.length - 2];
      return name.charAt(0).toUpperCase() + name.slice(1) + '.' + parts[parts.length - 1];
    }
    return host;
  } catch {
    return '';
  }
}

export type ParsedOgMetadata = {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
};

export function parseOgFromHtml(html: string, requestUrl: string): ParsedOgMetadata {
  const canonical = extractCanonical(html, requestUrl) ?? requestUrl;
  const title = extractTitle(html) ?? siteNameFromUrl(canonical);
  const description =
    extractMeta(html, 'og:description', 'property') ??
    extractMeta(html, 'description', 'name') ??
    '';
  const siteName =
    extractMeta(html, 'og:site_name', 'property') ?? siteNameFromUrl(canonical);
  const image = extractFirstImage(html, requestUrl);

  return {
    url: canonical,
    title: title.slice(0, 300),
    description: description.slice(0, 500),
    image,
    siteName: siteName.slice(0, 120),
  };
}
