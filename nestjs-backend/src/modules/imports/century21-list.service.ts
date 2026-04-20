import { Injectable } from '@nestjs/common';
import type { ImportedListingDraft } from './import-types';
import { Century21ParserService } from './century21-parser.service';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

@Injectable()
export class Century21ListService {
  constructor(private readonly parser: Century21ParserService) {}

  normalizeDetailUrl(raw: string): string | null {
    const t = (raw ?? '').trim();
    if (!t) return null;
    try {
      const u = new URL(t, 'https://www.century21.cz');
      if (!u.hostname.toLowerCase().endsWith('century21.cz')) return null;
      if (!u.pathname.toLowerCase().includes('/nemovitosti/')) return null;
      const id = u.searchParams.get('id');
      if (id && !UUID_RE.test(id)) return null;
      u.hash = '';
      if (id) u.searchParams.set('id', id.toLowerCase());
      return u.href;
    } catch {
      return null;
    }
  }

  externalIdFromDetailUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const id = parsed.searchParams.get('id');
      if (id && UUID_RE.test(id)) return id.toUpperCase();
      const slug = parsed.pathname.split('/').filter(Boolean).pop()?.trim() ?? '';
      if (slug) return `C21-${slug.replace(/[^a-zA-Z0-9]+/g, '-').toUpperCase().slice(0, 56)}`;
      return null;
    } catch {
      return null;
    }
  }

  slugFallbackTitle(url: string): string {
    try {
      const seg = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
      const slug = seg.split('?')[0] ?? '';
      if (!slug) return 'Nemovitost CENTURY 21';
      return decodeURIComponent(slug.replace(/-/g, ' ')).slice(0, 240);
    } catch {
      return 'Nemovitost CENTURY 21';
    }
  }

  extractHrefDetailUrls(html: string): string[] {
    const out: string[] = [];
    for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
      const h = m[1]?.trim();
      if (!h || h.startsWith('#') || /^javascript:/i.test(h)) continue;
      if (!/\/nemovitosti\//i.test(h)) continue;
      const n = this.normalizeDetailUrl(h);
      if (n) out.push(n);
    }
    return out;
  }

  extractAbsoluteDetailUrls(html: string): string[] {
    const out: string[] = [];
    for (const m of html.matchAll(/https:\/\/www\.century21\.cz\/nemovitosti\/[^"'\\\s<>]+/gi)) {
      const n = this.normalizeDetailUrl(m[0]);
      if (n) out.push(n);
    }
    for (const m of html.matchAll(/\/nemovitosti\/[^"'\\\s<>]+/gi)) {
      const n = this.normalizeDetailUrl(`https://www.century21.cz${m[0]}`);
      if (n) out.push(n);
    }
    return out;
  }

  mergeUniqueUrls(urls: string[]): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const u of urls) {
      const n = this.normalizeDetailUrl(u);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      ordered.push(n);
    }
    return ordered;
  }

  cardFragmentForUrl(html: string, url: string): string {
    const idx = html.indexOf(url);
    if (idx < 0) return '';
    return html.slice(Math.max(0, idx - 4500), Math.min(html.length, idx + 900));
  }

  extractNextListingPageUrl(html: string, currentAbs: string): string | null {
    const linkRel =
      html.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
      html.match(/<a[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)?.[1];
    if (!linkRel) return null;
    try {
      return new URL(linkRel, currentAbs).href;
    } catch {
      return null;
    }
  }

  rowFromListCard(detailUrl: string, html: string): ImportedListingDraft | null {
    const frag = this.cardFragmentForUrl(html, detailUrl);
    const card = this.parser.parseListCardFragment(frag);
    const eid = this.externalIdFromDetailUrl(detailUrl);
    if (!eid) return null;
    return {
      externalId: eid,
      title: (card.title ?? this.slugFallbackTitle(detailUrl)).slice(0, 400),
      description: '',
      price: card.priceText ? this.parser.normalizeListPrice(card.priceText) : null,
      city: (card.address ?? 'Neuvedeno').slice(0, 120),
      address: card.address ?? undefined,
      images: [],
      offerType: card.offerType,
      propertyType: card.propertyType,
      sourceUrl: detailUrl,
    };
  }
}
