import { Injectable } from '@nestjs/common';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsHttpError, HotelbedsHttpService } from './hotelbeds-http.service';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import { HotelbedsPublicService } from './hotelbeds-public.service';
import type { HotelbedsContentMeta } from './hotelbeds-content-meta.types';
import {
  buildContentHotelsUrl,
  buildHotelbedsImageUrl,
  localizedText,
  sortHotelbedsImages,
  type HbContentHotel,
} from './hotelbeds-normalizer';

type BookingSearchPayload = {
  hotels?: { hotels?: Array<{ code?: number; name?: string }> };
};

@Injectable()
export class HotelbedsDiagnosticsService {
  constructor(
    private readonly config: HotelbedsConfigService,
    private readonly http: HotelbedsHttpService,
    private readonly cache: HotelbedsCacheService,
    private readonly metrics: HotelbedsMetricsService,
    private readonly publicService: HotelbedsPublicService,
  ) {}

  getOverview() {
    const diagnostics = this.metrics.contentDiagnostics();
    const cacheInspection = this.cache.inspect(200);
    const contentLogs = [
      ...this.metrics.getContentHistory(50),
      ...this.metrics.getContentLogsFromApiLogs(),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 50);

    const hotelsWithImages = this.countHotelsWithImagesFromCache();

    return {
      bookingApi: {
        status: diagnostics.bookingApiOk ? 'OK' : 'UNKNOWN',
        httpStatus: diagnostics.bookingApiOk ? 200 : null,
      },
      contentApi: {
        status: diagnostics.contentApiPermissionDenied
          ? 'PERMISSION_DENIED'
          : diagnostics.contentApiOk
            ? 'OK'
            : 'ERROR',
        permissionDenied: diagnostics.contentApiPermissionDenied,
      },
      lastSuccessfulContentRequest: diagnostics.lastSuccessfulContentRequest,
      lastFailedContentRequest: diagnostics.lastFailedContentRequest,
      imageSourceCounts: diagnostics.imageSourceCounts,
      hotelsWithPhoto: {
        fromContentApi: diagnostics.imageSourceCounts.contentApi,
        fromCache: hotelsWithImages.inCache,
        fromDatabase: 0,
        fallback: diagnostics.imageSourceCounts.fallback,
        withoutPhoto: diagnostics.imageSourceCounts.none,
      },
      database: {
        available: false,
        note: 'Hotelbeds content se v projektu neukládá do databáze — pouze in-memory cache.',
      },
      contentHistory: contentLogs,
      cache: cacheInspection,
    };
  }

  getCacheInspector() {
    return this.cache.inspect(500);
  }

  async diagnoseHotel(hotelCode: number) {
    const codeStr = String(hotelCode);
    const contentKey = `content:${hotelCode}`;
    const metaKey = `content-meta:${hotelCode}`;

    const cachedContent = this.cache.peek<HbContentHotel>(contentKey);
    const cachedMeta = this.cache.peek<HotelbedsContentMeta>(metaKey);
    const contentEntryMeta = this.cache.getEntryMeta(contentKey);

    let bookingStatus = 0;
    let bookingName: string | null = null;
    let bookingError: string | null = null;
    try {
      const url = `${this.config.bookingBaseUrl}/hotels`;
      const body = {
        stay: { checkIn: futureDate(30), checkOut: futureDate(32) },
        occupancies: [{ rooms: 1, adults: 2, children: 0 }],
        hotels: { hotel: [hotelCode] },
      };
      const { data, status } = await this.http.postJson<BookingSearchPayload>(
        url,
        body,
        'booking/hotel-detail',
      );
      bookingStatus = status;
      bookingName = data.hotels?.hotels?.[0]?.name ?? null;
    } catch (err) {
      bookingStatus = err instanceof HotelbedsHttpError ? err.status : 0;
      bookingError = err instanceof Error ? err.message : String(err);
    }

    let contentStatus = 0;
    let contentError: string | null = null;
    try {
      const result = await this.publicService.testHotelContent(hotelCode);
      contentStatus = result.httpStatus;
      contentError = result.error ?? null;
    } catch (err) {
      contentStatus = err instanceof HotelbedsHttpError ? err.status : 0;
      contentError = err instanceof Error ? err.message : String(err);
    }

    const contentAfterTest = this.cache.peek<HbContentHotel>(contentKey);
    const contentForImages = contentAfterTest ?? cachedContent;
    const sortedImages = sortHotelbedsImages(contentForImages?.images);
    const imageDiagnostics = await Promise.all(
      sortedImages.slice(0, 8).map(async (img) => {
        const assembled = buildHotelbedsImageUrl(img.path, 'card');
        let httpStatus: number | null = null;
        if (assembled) {
          httpStatus = await this.checkImageUrl(assembled);
        }
        return {
          rawPath: img.path ?? null,
          assembledUrl: assembled,
          httpStatus,
          imageTypeCode: img.imageTypeCode ?? null,
          source: contentAfterTest || cachedContent ? 'HOTELBEDS_CACHE' : contentStatus === 200 ? 'HOTELBEDS_CONTENT_API' : 'NONE',
        };
      }),
    );

    const currentImageSource = sortedImages.length
      ? contentAfterTest || cachedContent
        ? 'HOTELBEDS_CACHE'
        : contentStatus === 200
          ? 'HOTELBEDS_CONTENT_API'
          : 'NONE'
      : 'NONE';

    const diagnostics = this.metrics.contentDiagnostics();

    return {
      hotelId: hotelCode,
      name: localizedText(cachedContent?.name) ?? bookingName,
      bookingApi: {
        httpStatus: bookingStatus,
        ok: bookingStatus === 200,
        error: bookingError,
      },
      contentApi: {
        httpStatus: contentStatus,
        ok: contentStatus === 200,
        permissionDenied: contentStatus === 401 || contentStatus === 403,
        error: contentError,
        endpoint: buildContentHotelsUrl(this.config.contentBaseUrl, [hotelCode], 'ENG'),
      },
      cache: {
        hit: Boolean(contentAfterTest ?? cachedContent),
        contentKey,
        imagesInCache: sortedImages.length,
        meta: this.cache.peek<HotelbedsContentMeta>(metaKey) ?? cachedMeta,
        entry: this.cache.getEntryMeta(contentKey) ?? contentEntryMeta,
      },
      database: {
        found: false,
        hasContent: false,
        imagesCount: 0,
        descriptionLength: 0,
        lastSyncedAt: null,
        provider: 'HOTELBEDS',
        sourceEnvironment: this.config.environment,
        note: 'V projektu neexistuje DB tabulka pro Hotelbeds hotel content.',
      },
      currentImageSource,
      lastSuccessfulContentFetch: diagnostics.lastSuccessfulContentRequest?.at ?? cachedMeta?.fetchedAt ?? null,
      images: imageDiagnostics,
      debugSource: {
        contentSource: contentAfterTest || cachedContent ? 'CACHE' : contentStatus === 200 ? 'CONTENT_API' : 'BOOKING_ONLY',
        imageSource: currentImageSource,
        contentApiStatus: contentStatus || null,
        contentFetchedAt: (this.cache.peek<HotelbedsContentMeta>(metaKey) ?? cachedMeta)?.fetchedAt ?? contentEntryMeta?.createdAt ?? null,
        cacheHit: Boolean(contentAfterTest ?? cachedContent),
        dbHit: false,
        fallbackUsed: false,
      },
      conclusionHints: this.buildConclusionHints({
        cachedContent: contentAfterTest ?? cachedContent ?? undefined,
        cachedMeta: (this.cache.peek<HotelbedsContentMeta>(metaKey) ?? cachedMeta) ?? undefined,
        contentStatus,
        currentImageSource,
        lastSuccess: diagnostics.lastSuccessfulContentRequest,
      }),
    };
  }

  async diagnosePublicHotels() {
    const targets: Array<{ label: string; code?: number; nameQuery?: string }> = [
      { label: 'Hotel Duo', code: 6741 },
      { label: 'Hotel Paris Prague', nameQuery: 'Paris Prague' },
      { label: 'Hotel U Zlatého Stromu', nameQuery: 'Zlat' },
    ];

    const hotels = [];
    for (const target of targets) {
      let code = target.code;
      if (!code && target.nameQuery) {
        code = (await this.findHotelCodeByName(target.nameQuery)) ?? undefined;
      }
      if (!code) {
        hotels.push({
          label: target.label,
          error: `Hotel nenalezen podle dotazu „${target.nameQuery ?? ''}“.`,
        });
        continue;
      }
      const diagnosis = await this.diagnoseHotel(code);
      hotels.push({ label: target.label, ...diagnosis });
    }

    return {
      testedAt: new Date().toISOString(),
      hotels,
      note: 'Diagnostika čte pouze in-memory cache a API logy — DB persistence pro Hotelbeds content neexistuje.',
    };
  }

  private async findHotelCodeByName(fragment: string): Promise<number | null> {
    try {
      const url = `${this.config.bookingBaseUrl}/hotels`;
      const body = {
        stay: { checkIn: futureDate(30), checkOut: futureDate(32) },
        occupancies: [{ rooms: 1, adults: 2, children: 0 }],
        geolocation: {
          latitude: 50.0755,
          longitude: 14.4378,
          radius: 15,
          unit: 'km',
        },
        filter: { maxHotels: 200 },
      };
      const { data } = await this.http.postJson<BookingSearchPayload>(url, body, 'booking/search');
      const needle = fragment.toLowerCase();
      const match = (data.hotels?.hotels ?? []).find((h) =>
        (h.name ?? '').toLowerCase().includes(needle),
      );
      return match?.code ?? null;
    } catch {
      return null;
    }
  }

  private buildConclusionHints(input: {
    cachedContent?: HbContentHotel;
    cachedMeta?: HotelbedsContentMeta;
    contentStatus: number;
    currentImageSource: string;
    lastSuccess: { at: string; imagesCount: number } | null;
  }) {
    const hints: string[] = [];
    if (input.cachedContent && (input.cachedContent.images?.length ?? 0) > 0) {
      hints.push('V in-memory cache existuje obsah s fotografiemi pro tento hotel.');
    } else {
      hints.push('V in-memory cache nejsou fotografie pro tento hotel.');
    }
    if (input.contentStatus === 403 || input.contentStatus === 401) {
      hints.push('Aktuální Content API request je blokován kvůli chybějícímu oprávnění.');
    }
    if (input.lastSuccess) {
      hints.push(
        `Poslední úspěšný Content API request v metrikách: ${input.lastSuccess.at} (${input.lastSuccess.imagesCount} obrázků).`,
      );
    } else {
      hints.push('V aktuálních metrikách není zaznamenán žádný úspěšný Content API request.');
    }
    if (input.cachedMeta) {
      hints.push(`Cache metadata: načteno ${input.cachedMeta.fetchedAt} ze zdroje ${input.cachedMeta.source}.`);
    }
    hints.push('DB persistence pro Hotelbeds content v projektu není implementována.');
    return hints;
  }

  private countHotelsWithImagesFromCache() {
    const inspection = this.cache.inspect(10000);
    let inCache = 0;
    for (const key of inspection.keys) {
      if (!key.startsWith('content:') || key.startsWith('content-meta:') || key.startsWith('content-batch:')) {
        continue;
      }
      const hotel = this.cache.peek<HbContentHotel>(key);
      if ((hotel?.images?.length ?? 0) > 0) inCache++;
    }
    return { inCache };
  }

  private async checkImageUrl(url: string): Promise<number | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      return res.status;
    } catch {
      return null;
    }
  }
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}
