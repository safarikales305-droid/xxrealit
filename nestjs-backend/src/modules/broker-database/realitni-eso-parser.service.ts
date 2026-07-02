import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { normalizeToE164 } from '../whatsapp/whatsapp-phone.util';
import type { RealitniEsoParsedContact } from '../imported-broker-contacts/directory-import.types';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const DEFAULT_DIRECTORY_URL = 'https://www.realitnieso.cz/adresar-rk';

@Injectable()
export class RealitniEsoParserService {
  private readonly logger = new Logger(RealitniEsoParserService.name);

  stripTags(html: string): string {
    return String(html ?? '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async checkRobotsAllowed(targetUrl: string): Promise<{ allowed: boolean; reason?: string }> {
    let origin: string;
    try {
      origin = new URL(targetUrl).origin;
    } catch {
      return { allowed: false, reason: 'Neplatná URL adresáře.' };
    }
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const res = await axios.get(robotsUrl, {
        timeout: 8_000,
        responseType: 'text',
        validateStatus: () => true,
        headers: { 'User-Agent': BROWSER_USER_AGENT },
      });
      if (res.status >= 400) return { allowed: true };
      const body = typeof res.data === 'string' ? res.data : '';
      const path = new URL(targetUrl).pathname || '/';
      const lines = body.split(/\r?\n/);
      let activeAgentAll = false;
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const lower = line.toLowerCase();
        if (lower.startsWith('user-agent:')) {
          const ua = line.slice('user-agent:'.length).trim();
          activeAgentAll = ua === '*';
          continue;
        }
        if (!activeAgentAll) continue;
        if (lower.startsWith('disallow:')) {
          const rule = line.slice('disallow:'.length).trim();
          if (!rule) continue;
          if (path === rule || path.startsWith(rule)) {
            return {
              allowed: false,
              reason: `robots.txt zakazuje cestu ${rule} pro User-agent: *`,
            };
          }
        }
      }
      return { allowed: true };
    } catch (e) {
      this.logger.warn(
        `robots.txt check failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { allowed: true };
    }
  }

  async fetchHtml(url: string): Promise<{ html: string; finalUrl: string; status: number }> {
    const res = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: 5,
      maxContentLength: MAX_HTML_BYTES,
      responseType: 'text',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'cs-CZ,cs;q=0.9',
        'User-Agent': BROWSER_USER_AGENT,
      },
      validateStatus: () => true,
    });
    const finalUrl =
      typeof res.request?.res?.responseUrl === 'string'
        ? res.request.res.responseUrl
        : url;
    const html = typeof res.data === 'string' ? res.data : '';
    if (res.status === 403 || /just a moment|cf-browser-verification/i.test(html.slice(0, 40_000))) {
      throw new Error('Web blokuje automatické načítání (HTTP 403 / ochrana).');
    }
    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status} při načítání ${url}`);
    }
    return { html, finalUrl, status: res.status };
  }

  normalizeDirectoryUrl(raw: string): string {
    const t = (raw ?? '').trim() || DEFAULT_DIRECTORY_URL;
    const u = new URL(t.startsWith('http') ? t : `https://${t}`);
    if (!/realitnieso\.cz$/i.test(u.hostname.replace(/^www\./i, ''))) {
      throw new Error('Podporován je pouze adresář na realitnieso.cz.');
    }
    return u.href.split('#')[0];
  }

  extractProfileLinks(html: string, baseUrl: string): string[] {
    const urls = new Set<string>();
    const re = /href=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1].trim();
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }
      if (
        !/adresar|rk-detail|realitni-kancelar|detail-rk|\/rk\//i.test(href) &&
        !/realitnieso\.cz\/[^"']*rk/i.test(href)
      ) {
        continue;
      }
      try {
        const abs = new URL(href, baseUrl).href.split('#')[0];
        if (/realitnieso\.cz/i.test(abs) && abs !== baseUrl.split('?')[0]) {
          urls.add(abs);
        }
      } catch {
        /* skip */
      }
    }
    return [...urls];
  }

  private cleanEmail(raw: string | null | undefined): string | null {
    const t = (raw ?? '').trim().toLowerCase();
    if (!t || !t.includes('@')) return null;
    const m = t.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);
    return m?.[1]?.slice(0, 120) ?? null;
  }

  private cleanPhone(raw: string | null | undefined): string | null {
    const t = (raw ?? '').replace(/\u00a0/g, ' ').trim();
    if (!t) return null;
    const digits = t.replace(/\D/g, '');
    if (digits.length < 9) return null;
    return t.slice(0, 40);
  }

  private cleanWebsite(raw: string | null | undefined): string | null {
    let t = (raw ?? '').trim();
    if (!t) return null;
    t = t.replace(/^\/+/, '');
    if (!/^https?:\/\//i.test(t)) {
      if (/^www\./i.test(t) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) {
        t = `https://${t}`;
      } else {
        return null;
      }
    }
    try {
      const u = new URL(t);
      return u.href.slice(0, 300);
    } catch {
      return null;
    }
  }

  private parseCityFromAddress(address: string): string | null {
    const m = address.match(/^([^,0-9]+?)(?:\s+\d{3}\s?\d{2})?[,]/);
    if (m?.[1]) return m[1].trim().slice(0, 120);
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return parts[0]?.slice(0, 120) ?? null;
  }

  parseDetailHtml(html: string, sourceUrl: string): RealitniEsoParsedContact | null {
    const text = this.stripTags(html);
    let companyName =
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
      html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ??
      html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ??
      '';
    companyName = this.stripTags(companyName).slice(0, 200);
    if (!companyName || companyName.length < 2) return null;

    const email =
      this.cleanEmail(html.match(/mailto:([^"'>\s]+)/i)?.[1]) ??
      this.cleanEmail(text.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i)?.[0]);
    const phone =
      this.cleanPhone(html.match(/href=["']tel:([^"']+)["']/i)?.[1]) ??
      this.cleanPhone(text.match(/(?:\+420\s*)?\d(?:[\s().-]*\d){8,12}/)?.[0]);
    const normalizedPhone = phone ? normalizeToE164(phone) : null;

    let website =
      this.cleanWebsite(html.match(/href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?www\./i)?.[1]) ??
      null;
    if (!website) {
      const webM = text.match(
        /(?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9.]+\.[a-z]{2,}(?:\/[^\s]*)?/i,
      );
      website = this.cleanWebsite(webM?.[0]);
    }

    let address: string | null = null;
    const addrM =
      text.match(/([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][^,\n]{2,40}\s+\d{3}\s?\d{2},\s*[^|]{5,120})/i) ??
      text.match(/((?:ul\.|tř\.|nám\.|nábř\.)[^|]{5,120})/i);
    if (addrM?.[1]) address = addrM[1].trim().slice(0, 300);

    const city = address ? this.parseCityFromAddress(address) : null;
    const listingCountM = text.match(/(\d+)\s*inzerát/i);
    const listingCount = listingCountM ? Number(listingCountM[1]) : 0;

    return {
      companyName,
      email,
      phone,
      normalizedPhone,
      website,
      city,
      address,
      sourceUrl,
      listingCount: Number.isFinite(listingCount) ? listingCount : 0,
    };
  }

  parseListingCardFragment(fragment: string, sourceUrl: string): RealitniEsoParsedContact | null {
    const titleM = fragment.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const companyName = this.stripTags(titleM?.[1] ?? '').slice(0, 200);
    if (!companyName || companyName.length < 2) return null;

    const text = this.stripTags(fragment);
    const email = this.cleanEmail(text.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i)?.[0]);
    const phone = this.cleanPhone(text.match(/(?:\+420\s*)?\d(?:[\s().-]*\d){8,12}/)?.[0]);
    const normalizedPhone = phone ? normalizeToE164(phone) : null;
    const website = this.cleanWebsite(
      text.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9.]+\.[a-z]{2,}/i)?.[0],
    );

    let address: string | null = null;
    const addrM = text.match(
      /([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][^\d]{2,40}\s+\d{3}\s?\d{2},\s*[^0-9@]{4,120})/,
    );
    if (addrM?.[1]) address = addrM[1].trim().slice(0, 300);
    const city = address ? this.parseCityFromAddress(address) : null;

    const listingM = fragment.match(/>\s*(\d{1,4})\s*</);
    const listingCount = listingM ? Number(listingM[1]) : 0;

    return {
      companyName,
      email,
      phone,
      normalizedPhone,
      website,
      city,
      address,
      sourceUrl,
      listingCount: Number.isFinite(listingCount) ? listingCount : 0,
    };
  }

  parseDirectoryListingPage(html: string, pageUrl: string): RealitniEsoParsedContact[] {
    const contacts: RealitniEsoParsedContact[] = [];
    const seen = new Set<string>();

    const profileLinks = this.extractProfileLinks(html, pageUrl);
    const cardRe = /<h3[\s\S]*?(?=<h3|$)/gi;
    const cards = html.match(cardRe) ?? [];
    for (const card of cards) {
      const linkInCard = card.match(/href=["']([^"']+)["']/i)?.[1];
      let sourceUrl = pageUrl;
      if (linkInCard) {
        try {
          sourceUrl = new URL(linkInCard, pageUrl).href.split('#')[0];
        } catch {
          /* keep pageUrl */
        }
      }
      const parsed = this.parseListingCardFragment(card, sourceUrl);
      if (parsed && !seen.has(parsed.sourceUrl)) {
        seen.add(parsed.sourceUrl);
        contacts.push(parsed);
      }
    }

    for (const link of profileLinks) {
      if (seen.has(link)) continue;
      const nameFromUrl = decodeURIComponent(link.split('/').pop() ?? '')
        .replace(/[-_]+/g, ' ')
        .trim();
      if (nameFromUrl.length >= 2) {
        contacts.push({
          companyName: nameFromUrl.slice(0, 200),
          email: null,
          phone: null,
          normalizedPhone: null,
          website: null,
          city: null,
          address: null,
          sourceUrl: link,
          listingCount: 0,
        });
        seen.add(link);
      }
    }

    return contacts;
  }

  findNextPageUrl(html: string, currentUrl: string, pageIndex: number): string | null {
    const relNext = html.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)?.[1];
    if (relNext) {
      try {
        return new URL(relNext, currentUrl).href;
      } catch {
        /* fall through */
      }
    }
    const u = new URL(currentUrl);
    const tryParams = ['page', 'strana', 'p'];
    for (const key of tryParams) {
      u.searchParams.set(key, String(pageIndex + 1));
      return u.href;
    }
    return null;
  }

  async crawlDirectory(
    directoryUrl: string,
    opts: { maxPages?: number; fetchDetails?: boolean; delayMs?: number; previewLimit?: number },
  ): Promise<{ contacts: RealitniEsoParsedContact[]; pagesScanned: number; errors: string[] }> {
    const maxPages = Math.min(50, Math.max(1, opts.maxPages ?? (opts.fetchDetails ? 10 : 3)));
    const delayMs = Math.max(300, opts.delayMs ?? 800);
    const errors: string[] = [];
    const byUrl = new Map<string, RealitniEsoParsedContact>();

    let currentUrl = this.normalizeDirectoryUrl(directoryUrl);
    let pagesScanned = 0;
    const firstPageHash = new Set<string>();

    for (let page = 1; page <= maxPages; page += 1) {
      let html: string;
      try {
        const fetched = await this.fetchHtml(currentUrl);
        html = fetched.html;
        currentUrl = fetched.finalUrl;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        break;
      }
      pagesScanned += 1;

      const listingContacts = this.parseDirectoryListingPage(html, currentUrl);
      const pageFingerprint = listingContacts.map((c) => c.sourceUrl).sort().join('|');
      if (page === 1) {
        for (const k of pageFingerprint.split('|').filter(Boolean)) firstPageHash.add(k);
      } else if (pageFingerprint && [...firstPageHash].every((k) => pageFingerprint.includes(k))) {
        break;
      }

      for (const c of listingContacts) {
        byUrl.set(c.sourceUrl, c);
      }

      if (opts.previewLimit && byUrl.size >= opts.previewLimit) break;

      const nextUrl = this.findNextPageUrl(html, currentUrl, page);
      if (!nextUrl || nextUrl === currentUrl) break;
      currentUrl = nextUrl;
      await new Promise((r) => setTimeout(r, delayMs));
    }

    if (opts.fetchDetails) {
      const entries = [...byUrl.values()];
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (opts.previewLimit && byUrl.size >= opts.previewLimit && i >= opts.previewLimit) break;
        try {
          const { html } = await this.fetchHtml(entry.sourceUrl);
          const detail = this.parseDetailHtml(html, entry.sourceUrl);
          if (detail) {
            byUrl.set(entry.sourceUrl, {
              ...entry,
              ...detail,
              companyName: detail.companyName || entry.companyName,
              sourceUrl: entry.sourceUrl,
            });
          }
        } catch (e) {
          errors.push(
            `Detail ${entry.sourceUrl}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        if (i < entries.length - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    return { contacts: [...byUrl.values()], pagesScanned, errors };
  }
}
