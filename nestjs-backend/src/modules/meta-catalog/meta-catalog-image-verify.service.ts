import { Injectable, Logger } from '@nestjs/common';
import sharp from '../../lib/sharp-instance';
import { MetaCatalogFeedService } from './meta-catalog-feed.service';
import { MetaCatalogLogService } from './meta-catalog-log.service';
import {
  catalogImageMeetsMetaSize,
  isAllowedCatalogContentType,
} from './meta-catalog-image.util';

export type CatalogImageProbeResult = {
  propertyId: string;
  title: string;
  role: 'image_link' | 'additional_image_link';
  url: string;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  width: number | null;
  height: number | null;
  durationMs: number;
  ok: boolean;
  error: string | null;
};

export type CatalogImageListingDiagnostic = {
  propertyId: string;
  title: string;
  imageLink: string | null;
  additionalCount: number;
  firstImageUrl: string | null;
  imageLinkOk: boolean;
};

@Injectable()
export class MetaCatalogImageVerifyService {
  private readonly logger = new Logger(MetaCatalogImageVerifyService.name);

  constructor(
    private readonly feed: MetaCatalogFeedService,
    private readonly logService: MetaCatalogLogService,
  ) {}

  async probeImageUrl(
    propertyId: string,
    title: string,
    role: 'image_link' | 'additional_image_link',
    url: string,
  ): Promise<CatalogImageProbeResult> {
    const started = Date.now();
    const base: CatalogImageProbeResult = {
      propertyId,
      title,
      role,
      url,
      httpStatus: null,
      contentType: null,
      contentLength: null,
      width: null,
      height: null,
      durationMs: 0,
      ok: false,
      error: null,
    };

    if (!url.startsWith('https://')) {
      return {
        ...base,
        durationMs: Date.now() - started,
        error: 'URL musí být veřejná HTTPS adresa',
      };
    }

    try {
      const fetchHeaders = {
        Accept: 'image/jpeg, image/png, image/*',
        'User-Agent': 'XXREALIT-MetaCatalog/1.0',
      };
      const fetchOpts = {
        redirect: 'follow' as const,
        signal: AbortSignal.timeout(25_000),
        headers: fetchHeaders,
      };

      let res = await fetch(url, {
        ...fetchOpts,
        method: 'GET',
        headers: { ...fetchHeaders, Range: 'bytes=0-262143' },
      });

      if ([405, 501, 416].includes(res.status)) {
        res = await fetch(url, { ...fetchOpts, method: 'GET' });
      } else if ([403, 404].includes(res.status)) {
        res = await fetch(url, { ...fetchOpts, method: 'GET' });
      }

      const httpStatus = res.status === 206 ? 200 : res.status;
      const contentType = res.headers.get('content-type');
      const headerLen = res.headers.get('content-length');
      let contentLength = headerLen ? Number(headerLen) || null : null;
      let width: number | null = null;
      let height: number | null = null;

      if (httpStatus !== 200) {
        return {
          ...base,
          httpStatus: res.status,
          contentType,
          contentLength,
          durationMs: Date.now() - started,
          error: `HTTP ${res.status}`,
        };
      }

      if (!isAllowedCatalogContentType(contentType)) {
        return {
          ...base,
          httpStatus,
          contentType,
          contentLength,
          durationMs: Date.now() - started,
          error: `Neplatný Content-Type: ${contentType ?? 'neznámý'} (povoleno image/jpeg, image/png)`,
        };
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      contentLength = buffer.length;
      if (!buffer.length) {
        return {
          ...base,
          httpStatus,
          contentType,
          contentLength: 0,
          durationMs: Date.now() - started,
          error: 'Prázdná odpověď',
        };
      }

      try {
        const meta = await sharp(buffer).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        return {
          ...base,
          httpStatus,
          contentType,
          contentLength,
          durationMs: Date.now() - started,
          error: 'Odpověď není platný obrázek',
        };
      }

      if (!catalogImageMeetsMetaSize(width, height)) {
        return {
          ...base,
          httpStatus,
          contentType,
          contentLength,
          width,
          height,
          durationMs: Date.now() - started,
          error: `Obrázek je příliš malý (${width}×${height}, Meta doporučuje min. 500×500)`,
        };
      }

      return {
        ...base,
        httpStatus,
        contentType,
        contentLength,
        width,
        height,
        durationMs: Date.now() - started,
        ok: true,
        error: null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = /abort|timeout/i.test(msg);
      return {
        ...base,
        durationMs: Date.now() - started,
        error: isTimeout ? 'Timeout při načítání' : msg,
      };
    }
  }

  collectImageUrlsFromRecord(
    propertyId: string,
    title: string,
    record: Record<string, unknown>,
  ): Array<{ role: 'image_link' | 'additional_image_link'; url: string }> {
    const out: Array<{ role: 'image_link' | 'additional_image_link'; url: string }> = [];
    const main = String(record.image_link ?? record.main_image ?? '').trim();
    if (main) out.push({ role: 'image_link', url: main });

    const additional = record.additional_image_link ?? record.gallery;
    const extras = Array.isArray(additional) ? additional : [];
    for (const raw of extras) {
      const u = String(raw ?? '').trim();
      if (!u || u === main) continue;
      out.push({ role: 'additional_image_link', url: u });
    }
    return out;
  }

  async verifyAllFeedImages(): Promise<{
    summary: {
      totalUrls: number;
      ok: number;
      failed: number;
      listings: number;
    };
    items: CatalogImageProbeResult[];
    listings: CatalogImageListingDiagnostic[];
  }> {
    const built = await this.feed.buildExportRecords();
    const items: CatalogImageProbeResult[] = [];
    const listings: CatalogImageListingDiagnostic[] = [];

    for (const row of built) {
      const title = String(row.record.title ?? 'Nemovitost');
      const urls = this.collectImageUrlsFromRecord(row.id, title, row.record as Record<string, unknown>);
      const mainUrl = urls.find((u) => u.role === 'image_link')?.url ?? null;
      let imageLinkOk = false;

      for (const entry of urls) {
        const probe = await this.probeImageUrl(row.id, title, entry.role, entry.url);
        items.push(probe);
        if (entry.role === 'image_link' && probe.ok) imageLinkOk = true;
      }

      listings.push({
        propertyId: row.id,
        title,
        imageLink: mainUrl,
        additionalCount: urls.filter((u) => u.role === 'additional_image_link').length,
        firstImageUrl: mainUrl,
        imageLinkOk,
      });
    }

    const ok = items.filter((i) => i.ok).length;
    const failed = items.length - ok;

    await this.logService.log('image_verify', `Ověřeno ${items.length} URL, OK: ${ok}, chyb: ${failed}`, {
      details: { totalUrls: items.length, ok, failed },
    });

    this.logger.log(`Meta catalog image verify: ${ok}/${items.length} OK`);

    return {
      summary: {
        totalUrls: items.length,
        ok,
        failed,
        listings: listings.length,
      },
      items,
      listings,
    };
  }

  async getListingImageDiagnostics(): Promise<{ listings: CatalogImageListingDiagnostic[] }> {
    const built = await this.feed.buildExportRecords();
    const listings = built.map((row) => {
      const title = String(row.record.title ?? 'Nemovitost');
      const main = String(row.record.image_link ?? row.record.main_image ?? '').trim() || null;
      const additional = row.record.additional_image_link ?? row.record.gallery;
      const additionalCount = Array.isArray(additional) ? additional.length : 0;
      return {
        propertyId: row.id,
        title,
        imageLink: main,
        additionalCount,
        firstImageUrl: main,
        imageLinkOk: Boolean(main?.startsWith('https://')),
      };
    });
    return { listings };
  }
}
