/** Extrakce metadat a obrázků ze Sreality / Next.js HTML. */

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractNextDataJson(html: string): unknown | null {
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]?.trim()) return null;
  try {
    return JSON.parse(m[1]) as unknown;
  } catch {
    return null;
  }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as unknown);
    } catch {
      /* skip */
    }
  }
  return out;
}

function collectHttpsImageUrls(value: unknown, out: string[], depth = 0): void {
  if (depth > 14 || out.length > 40) return;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!/^https:\/\//i.test(s)) return;
    if (/\.(jpe?g|webp|png)(\?|$)/i.test(s) || /sreality\.cz.*\/(foto|image|photo)/i.test(s)) {
      if (!/logo|icon|favicon|sprite|pixel|1x1|tracking/i.test(s)) {
        out.push(s);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectHttpsImageUrls(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectHttpsImageUrls(v, out, depth + 1);
    }
  }
}

function pickBestImage(candidates: string[]): string | null {
  const unique = [...new Set(candidates)];
  const scored = unique
    .map((url) => {
      let score = 0;
      if (/sreality\.cz/i.test(url)) score += 5;
      if (/\/\d+x\d+\//i.test(url) || /_sreality_/i.test(url)) score += 3;
      if (/foto|photo|gallery|estate|nemovitost/i.test(url)) score += 2;
      if (/\.webp(\?|$)/i.test(url)) score += 1;
      if (/\.jpe?g(\?|$)/i.test(url)) score += 2;
      if (/thumb|small|mini/i.test(url)) score -= 2;
      return { url, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url ?? null;
}

function stringFromJsonLd(blocks: unknown[]): { title?: string; description?: string; image?: string } {
  const images: string[] = [];
  let title: string | undefined;
  let description: string | undefined;

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    const o = node as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const headline = typeof o.headline === 'string' ? o.headline.trim() : '';
    const desc = typeof o.description === 'string' ? o.description.trim() : '';
    if (name && name.length > 3 && !title) title = name;
    if (headline && headline.length > 3 && !title) title = headline;
    if (desc && desc.length > 5 && !description) description = desc;

    const img = o.image ?? o.photo ?? o.thumbnailUrl;
    if (typeof img === 'string') images.push(img);
    if (Array.isArray(img)) {
      for (const x of img) {
        if (typeof x === 'string') images.push(x);
        if (x && typeof x === 'object' && typeof (x as { url?: string }).url === 'string') {
          images.push((x as { url: string }).url);
        }
      }
    }
    if (img && typeof img === 'object' && typeof (img as { url?: string }).url === 'string') {
      images.push((img as { url: string }).url);
    }

    for (const v of Object.values(o)) visit(v);
  };

  for (const block of blocks) visit(block);
  return {
    title,
    description,
    image: pickBestImage(images),
  };
}

function findJpgWebpInHtml(html: string, baseUrl: string): string | null {
  const urls: string[] = [];
  const patterns = [
    /https?:\/\/[^"'\\\s]+\.(?:jpe?g|webp)(?:\?[^"'\\\s]*)?/gi,
    /"(https:\/\/[^"]*sreality\.cz[^"]*?)"/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1] ?? m[0];
      if (!raw || /logo|icon|favicon/i.test(raw)) continue;
      try {
        urls.push(new URL(raw, baseUrl).href);
      } catch {
        urls.push(raw);
      }
    }
  }
  return pickBestImage(urls);
}

export type SrealityScrapeExtras = {
  title?: string | null;
  description?: string | null;
  image?: string | null;
};

export function scrapeSrealityFromHtml(html: string, pageUrl: string): SrealityScrapeExtras {
  const jsonLd = extractJsonLdBlocks(html);
  const fromLd = stringFromJsonLd(jsonLd);

  const nextData = extractNextDataJson(html);
  const nextImages: string[] = [];
  if (nextData) collectHttpsImageUrls(nextData, nextImages);

  let title = fromLd.title ? decodeHtmlEntities(fromLd.title) : null;
  let description = fromLd.description ? decodeHtmlEntities(fromLd.description) : null;

  if (nextData && typeof nextData === 'object') {
    const props = (nextData as { props?: { pageProps?: Record<string, unknown> } }).props
      ?.pageProps;
    if (props && typeof props === 'object') {
      const estate = (props.estate ?? props.detail ?? props.advert ?? props.data) as
        | Record<string, unknown>
        | undefined;
      if (estate && typeof estate === 'object') {
        const t =
          (typeof estate.name === 'string' && estate.name) ||
          (typeof estate.title === 'string' && estate.title) ||
          '';
        const d = typeof estate.description === 'string' ? estate.description : '';
        if (t && !title) title = decodeHtmlEntities(t);
        if (d && !description) description = decodeHtmlEntities(d);
      }
    }
  }

  const image =
    fromLd.image ??
    pickBestImage(nextImages) ??
    findJpgWebpInHtml(html, pageUrl);

  return {
    title: title?.slice(0, 300) ?? null,
    description: description?.slice(0, 500) ?? null,
    image,
  };
}

export function isSrealityHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes('sreality.cz');
  } catch {
    return /sreality\.cz/i.test(url);
  }
}
