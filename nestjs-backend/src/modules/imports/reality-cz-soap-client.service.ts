import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { ImportedListingDraft } from './import-types';

function base32ToBuffer(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  const clean = input.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx >= 0) bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string): string {
  const key = base32ToBuffer(secret);
  const counter = Math.floor(Date.now() / 30_000);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

function xmlTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m?.[1]?.trim() ?? '';
}

function xmlTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null = re.exec(xml);
  while (m) {
    out.push((m[1] ?? '').trim());
    m = re.exec(xml);
  }
  return out;
}

@Injectable()
export class RealityCzSoapClientService {
  private readonly logger = new Logger(RealityCzSoapClientService.name);
  constructor(private readonly config: ConfigService) {}

  private getConfig() {
    return {
      wsdlUrl: this.config.get<string>('REALITY_CZ_WSDL_URL') ?? '',
      username: this.config.get<string>('REALITY_CZ_USERNAME') ?? '',
      password: this.config.get<string>('REALITY_CZ_PASSWORD') ?? '',
      totpSecret: this.config.get<string>('REALITY_CZ_TOTP_SECRET') ?? '',
    };
  }

  isConfigured(): boolean {
    const cfg = this.getConfig();
    return Boolean(cfg.wsdlUrl && cfg.username && cfg.password && cfg.totpSecret);
  }

  async fetchListings(limit: number): Promise<ImportedListingDraft[]> {
    const cfg = this.getConfig();
    if (!this.isConfigured()) {
      this.logger.warn('Reality.cz SOAP credentials are not fully configured.');
      return [];
    }
    const totp = generateTotp(cfg.totpSecret);
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetListingsRequest xmlns="https://reality.cz/soap">
      <username>${cfg.username}</username>
      <password>${cfg.password}</password>
      <totp>${totp}</totp>
      <limit>${Math.max(1, Math.min(500, Math.trunc(limit || 100)))}</limit>
    </GetListingsRequest>
  </soap:Body>
</soap:Envelope>`;

    const res = await fetch(cfg.wsdlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'GetListings',
      },
      body: envelope,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`SOAP HTTP ${res.status}: ${txt.slice(0, 240)}`);
    }
    const xml = await res.text();
    return this.parseListings(xml);
  }

  private parseListings(xml: string): ImportedListingDraft[] {
    const listingBlocks = xmlTags(xml, 'listing');
    const out: ImportedListingDraft[] = [];
    for (const block of listingBlocks) {
      const externalId = xmlTag(block, 'externalId') || xmlTag(block, 'id');
      if (!externalId) continue;
      const title = xmlTag(block, 'title') || 'Importovaný inzerát';
      const description = xmlTag(block, 'description') || title;
      const priceRaw = xmlTag(block, 'price').replace(/[^\d]/g, '');
      const price = Math.max(1, Number.parseInt(priceRaw || '0', 10) || 1);
      const city = xmlTag(block, 'city') || xmlTag(block, 'locality') || 'Neznámé město';
      const address = xmlTag(block, 'address').slice(0, 240);
      const sourceUrl = xmlTag(block, 'url').trim();
      const offerType = xmlTag(block, 'offerType') || 'prodej';
      const propertyType = xmlTag(block, 'propertyType') || 'byt';
      const images = xmlTags(block, 'image').filter((x) => /^https?:\/\//i.test(x));
      const videoUrl = xmlTag(block, 'videoUrl') || null;
      const draft: ImportedListingDraft = {
        externalId,
        title: title.slice(0, 250),
        description: description.slice(0, 10_000),
        price,
        city: city.slice(0, 120),
        images: images.slice(0, 40),
        videoUrl,
        offerType,
        propertyType,
      };
      if (address) draft.address = address;
      if (/^https?:\/\//i.test(sourceUrl)) draft.sourceUrl = sourceUrl;
      out.push(draft);
    }
    return out;
  }
}

