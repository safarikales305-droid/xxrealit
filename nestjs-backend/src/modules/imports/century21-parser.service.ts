import { Injectable } from '@nestjs/common';
import type { ImportedListingDraft } from './import-types';
import { normalizeStoredImageUrl } from './import-image-urls';
import { safeParsePrice, unwrapImportedPriceValue } from './price-parse.util';

@Injectable()
export class Century21ParserService {
  stripTags(html: string): string {
    return String(html ?? '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  cleanText(value?: string | null): string | null {
    if (!value) return null;
    const text = this.stripTags(value);
    return text || null;
  }

  normalizeListPrice(raw: unknown): number | null {
    const unwrapped = unwrapImportedPriceValue(raw);
    const parsed =
      typeof unwrapped === 'number'
        ? Number.isFinite(unwrapped) && unwrapped > 0
          ? Math.trunc(unwrapped)
          : null
        : safeParsePrice(
            typeof unwrapped === 'string' ? unwrapped : unwrapped != null ? String(unwrapped) : null,
          );
    if (parsed == null) return null;
    if (parsed < 1 || parsed > 500_000_000) return null;
    return parsed;
  }

  parseListCardFragment(frag: string): {
    title: string | null;
    priceText: string | null;
    address: string | null;
    offerType: string;
    propertyType: string;
  } {
    const text = this.stripTags(frag);
    let title: string | null = null;
    const h = frag.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
    if (h?.[1]) title = this.cleanText(h[1]);
    const priceM = frag.match(/(\d[\d\s\u00a0.\u202f]{2,})\s*(?:Kč|CZK)/i);
    const priceText = priceM ? this.cleanText(priceM[0]) : null;
    const offerType = /pronájem|pronajem|nájem|najem/i.test(frag) ? 'pronájem' : 'prodej';
    let propertyType = 'nemovitost';
    if (/dům|dum|rodinný|rodinny|vila/i.test(frag)) propertyType = 'dům';
    else if (/byt/i.test(frag)) propertyType = 'byt';
    else if (/pozem/i.test(frag)) propertyType = 'pozemek';
    else if (/garáž|garaz/i.test(frag)) propertyType = 'garáž';
    else if (/komerční|komercni|kancelář|kancelar|obchodní|obchodni/i.test(frag)) propertyType = 'komerční';
    let address: string | null = null;
    const addrM = frag.match(/(?:ul\.|tř\.|nám\.|nábř\.|obec)[^<]{0,120}/i);
    if (addrM?.[0]) address = this.cleanText(addrM[0]);
    if (!title && text.length > 12) title = text.slice(0, 200);
    return { title, priceText, address, offerType, propertyType };
  }

  private isLikelyGalleryImageUrl(url: string): boolean {
    const low = url.toLowerCase();
    if (!/^https?:\/\//i.test(url) || low.startsWith('data:')) return false;
    if (/\.(svg)(\?|#|$)/i.test(low)) return false;
    if (/(logo|favicon|icon|icons|sprite|placeholder|avatar|contact_phone|contact_mail|contact_email)/i.test(low)) {
      return false;
    }
    return true;
  }

  private cleanContactToken(raw: string): string {
    return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private looksInvalidContactToken(v: string): boolean {
    const t = v.trim().toLowerCase();
    if (!t) return true;
    if (/^https?:\/\//.test(t)) return true;
    if (/\.svg(\?|#|$)/.test(t)) return true;
    if (/(icon|icons|logo|placeholder|contact_phone|contact_mail|contact_email)/.test(t)) return true;
    return false;
  }

  private extractEmailFromHtml(html: string): string | null {
    const mailto = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)?.[1];
    if (mailto) return mailto.toLowerCase().slice(0, 120);
    const m = html.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
    if (!m?.[1]) return null;
    return m[1].toLowerCase().slice(0, 120);
  }

  private extractPhoneFromHtml(html: string): string | null {
    const telHref = html.match(/href=["']tel:([^"']+)["']/i)?.[1] ?? '';
    const token = this.cleanContactToken(telHref);
    if (token && !this.looksInvalidContactToken(token) && token.replace(/\D/g, '').length >= 9) {
      return token.slice(0, 40);
    }
    const any = html.match(/(?:\+420\s*)?\d(?:[\s().-]*\d){8,14}/);
    if (!any?.[0]) return null;
    const normalized = this.cleanContactToken(any[0]);
    if (this.looksInvalidContactToken(normalized)) return null;
    return normalized.slice(0, 40);
  }

  private parseNumericArea(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.trunc(v);
    if (typeof v !== 'string') return null;
    const m = v.replace(/\u00a0/g, ' ').match(/(\d{1,4}(?:[.,]\d{1,2})?)/);
    if (!m?.[1]) return null;
    const n = Number(m[1].replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.trunc(n);
  }

  parseDetailHtml(html: string): Partial<ImportedListingDraft> {
    const out: Partial<ImportedListingDraft> = {};
    let invalidContactTokensFiltered = 0;
    const title =
      this.cleanText(
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
          html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
          null,
      ) ?? null;
    if (title) out.title = title.slice(0, 400);

    const descBlock =
      html.match(/(?:Popis|popis nemovitosti)[\s\S]{0,80}>([\s\S]{200,12000}?)(?:Kontakt|makléř|Zaujala)/i)?.[1] ??
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
      null;
    const desc = descBlock ? this.stripTags(descBlock).slice(0, 60_000) : null;
    if (desc && desc.length > 40) out.description = desc;

    const priceStr = html.match(/(\d[\d\s\u00a0.\u202f]{3,})\s*(?:Kč|CZK)/i)?.[1] ?? null;
    const priceParsed = priceStr ? this.normalizeListPrice(priceStr) : null;
    if (priceParsed != null) out.price = priceParsed;

    const rawImageCandidates: string[] = [];
    for (const m of html.matchAll(/https:\/\/[^"'\\\s<>]+\.(?:jpe?g|png|webp)(?:\?[^"'\\\s<>]*)?/gi)) {
      rawImageCandidates.push(m[0]);
    }
    for (const imgTag of html.matchAll(/<img[^>]+>/gi)) {
      const tag = imgTag[0];
      for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'src']) {
        const mm = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
        if (mm?.[1]) rawImageCandidates.push(mm[1]);
      }
      const srcset = tag.match(/srcset=["']([^"']+)["']/i)?.[1] ?? '';
      if (srcset) {
        for (const seg of srcset.split(',')) {
          const u = seg.trim().split(/\s+/)[0] ?? '';
          if (u) rawImageCandidates.push(u);
        }
      }
    }
    const images: string[] = [];
    const seen = new Set<string>();
    for (const cand of rawImageCandidates) {
      try {
        const abs = /^https?:/i.test(cand) ? cand : new URL(cand, 'https://www.century21.cz').href;
        const n = normalizeStoredImageUrl(abs) ?? abs;
        if (!this.isLikelyGalleryImageUrl(n) || seen.has(n)) continue;
        seen.add(n);
        images.push(n);
        if (images.length >= 80) break;
      } catch {
        /* ignore */
      }
    }
    out.images = images;

    const email = this.extractEmailFromHtml(html);
    if (email) out.contactEmail = email;

    const phone = this.extractPhoneFromHtml(html);
    if (phone) {
      const cleaned = this.cleanContactToken(phone);
      if (!this.looksInvalidContactToken(cleaned)) out.contactPhone = cleaned.slice(0, 40);
      else invalidContactTokensFiltered += 1;
    }

    const brokerName = html.match(
      /(?:makléř|makler|Makléř)[\s\S]{0,2000}?(\b[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(?:\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+){1,3}\b)/i,
    )?.[1];
    if (brokerName) {
      const cleaned = this.cleanText(brokerName)?.slice(0, 120) ?? '';
      if (!this.looksInvalidContactToken(cleaned)) out.contactName = cleaned;
      else invalidContactTokensFiltered += 1;
    }

    const office = html.match(/(CENTURY\s*21[^<\n]{0,120})/i)?.[1];
    if (office) out.contactCompany = this.cleanText(office)?.slice(0, 200) ?? undefined;

    const address = this.cleanText(
      html.match(/(?:Adresa|Lokalita)[^<]{0,20}<\/[^>]+>\s*<[^>]*>([^<]{4,220})</i)?.[1] ?? null,
    );
    if (address) out.address = address.slice(0, 500);
    if (address && !out.city) out.city = address.split(',')[0]?.trim().slice(0, 120);

    const allText = this.stripTags(html);
    out.offerType = /pron[aá]jem|nájem|najem/i.test(allText) ? 'pronájem' : 'prodej';
    if (/d[uů]m|villa|rodinn/i.test(allText)) out.propertyType = 'dům';
    else if (/apartment|flat|byt/i.test(allText)) out.propertyType = 'byt';
    else if (/land|pozem/i.test(allText)) out.propertyType = 'pozemek';

    const usable = this.parseNumericArea(allText.match(/(?:Užitná plocha|Podlahová plocha)\s*[:\-]?\s*([0-9.,\s]+)/i)?.[1]);
    const land = this.parseNumericArea(allText.match(/(?:Plocha pozemku|Pozemek)\s*[:\-]?\s*([0-9.,\s]+)/i)?.[1]);
    if (usable != null) out.area = usable;
    if (land != null) out.attributes = { ...(out.attributes as object), landArea: land } as Record<string, unknown>;

    out.invalidContactTokensFiltered = invalidContactTokensFiltered;
    return out;
  }
}
