import { Injectable } from '@nestjs/common';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsHttpError, HotelbedsHttpService } from './hotelbeds-http.service';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import { HotelbedsPublicService } from './hotelbeds-public.service';
import type { HotelbedsContentMeta } from './hotelbeds-content-meta.types';
import { HotelbedsContentStorageService } from './hotelbeds-content-storage.service';
import { HotelbedsImageService } from './hotelbeds-image.service';
import {
  HOTELBEDS_CONTENT_LANGUAGE,
  buildContentHotelsUrl,
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
    private readonly contentStorage: HotelbedsContentStorageService,
    private readonly imageService: HotelbedsImageService,
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
        available: true,
        note: 'Hotelbeds content se ukládá do tabulky Accommodation (provider=HOTELBEDS).',
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
    let bookingErrorCode: string | null = null;
    let bookingErrorMessage: string | null = null;
    let bookingNote: string | null = null;
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
      const { data, status } = await this.http.postJson<BookingSearchPayload>(url, body, 'booking/search');
      bookingStatus = status;
      const match = (data.hotels?.hotels ?? []).find((h) => h.code === hotelCode);
      bookingName = match?.name ?? null;
      if (!match) {
        bookingNote =
          'Hotel nebyl v geo search výsledku — to neznamená chybu credentials. Content API je nezávislé na dostupnosti.';
      }
    } catch (err) {
      bookingStatus = err instanceof HotelbedsHttpError ? err.status : 0;
      bookingError = err instanceof Error ? err.message : String(err);
      if (err instanceof HotelbedsHttpError && err.errorBody) {
        bookingErrorCode = err.errorBody.match(/Error code:\s*(.+)/i)?.[1]?.trim() ?? null;
        bookingErrorMessage = err.errorBody.match(/Message:\s*(.+)/i)?.[1]?.trim() ?? err.errorBody.slice(0, 200);
      }
    }

    const rawContent = await this.publicService.getRawContentDiagnostics(hotelCode);
    const contentStatus = rawContent.httpStatus;
    const contentError = 'error' in rawContent ? (rawContent.error as string) : null;

    const contentAfterTest = this.cache.peek<HbContentHotel>(contentKey);
    const contentForImages = contentAfterTest ?? cachedContent;
    const sortedImages = sortHotelbedsImages(contentForImages?.images);
    const imagesInDb = await this.contentStorage.countImages(hotelCode);
    const dbContent = await this.contentStorage.findByProviderId(hotelCode);
    const imageDiagnostics = await Promise.all(
      sortedImages.slice(0, 8).map(async (img, idx) => {
        const delivery = await this.imageService.probeDelivery(hotelCode, idx, 'card');
        return {
          rawPath: img.path ?? null,
          assembledUrl: delivery.resolvedUrl,
          proxyUrl: delivery.proxyUrl,
          httpStatus: delivery.httpStatus,
          contentType: delivery.contentType,
          folder: delivery.folder,
          imageTypeCode: img.imageTypeCode ?? null,
          source: contentAfterTest || cachedContent ? 'HOTELBEDS_CACHE' : contentStatus === 200 ? 'HOTELBEDS_CONTENT_API' : 'NONE',
        };
      }),
    );

    const firstImageDelivery = await this.imageService.probeDelivery(hotelCode, 0, 'card');

    const currentImageSource = imagesInDb > 0
      ? 'DATABASE_CACHE'
      : sortedImages.length
        ? contentAfterTest || cachedContent
          ? 'HOTELBEDS_CACHE'
          : contentStatus === 200
            ? 'HOTELBEDS_CONTENT_API'
            : 'NONE'
        : 'NONE';

    const diagnostics = this.metrics.contentDiagnostics();
    const authOk = Boolean(this.http.getCredentials());
    const statusBoard = {
      AUTH: authOk ? 'OK' : 'MISSING_CREDENTIALS',
      BOOKING_API: bookingStatus === 200 ? 'OK 200' : bookingStatus ? `ERROR ${bookingStatus}` : 'UNKNOWN',
      CONTENT_API: contentStatus === 200 ? 'OK 200' : contentStatus ? `ERROR ${contentStatus}` : 'UNKNOWN',
      CONTENT_DB: imagesInDb > 0 || dbContent ? 'OK' : 'EMPTY',
      HOTEL_IMAGES: sortedImages.length,
      IMAGE_DELIVERY:
        firstImageDelivery.httpStatus === 200 ? 'OK 200' : firstImageDelivery.httpStatus ? `ERROR ${firstImageDelivery.httpStatus}` : 'UNKNOWN',
    };

    return {
      hotelId: hotelCode,
      name: localizedText(cachedContent?.name) ?? localizedText(dbContent?.name) ?? bookingName,
      statusBoard,
      bookingApi: {
        httpStatus: bookingStatus,
        ok: bookingStatus === 200,
        error: bookingError,
        errorCode: bookingErrorCode,
        errorMessage: bookingErrorMessage,
        note: bookingNote,
        environment: this.config.environment,
        endpoint: `${this.config.bookingBaseUrl}/hotels`,
      },
      contentApi: {
        httpStatus: contentStatus,
        ok: contentStatus === 200,
        permissionDenied: contentStatus === 401 || contentStatus === 403,
        error: contentError,
        endpoint: buildContentHotelsUrl(this.config.contentBaseUrl, [hotelCode], HOTELBEDS_CONTENT_LANGUAGE),
        language: HOTELBEDS_CONTENT_LANGUAGE,
      },
      rawContent,
      cache: {
        hit: Boolean(contentAfterTest ?? cachedContent),
        contentKey,
        imagesInCache: sortedImages.length,
        meta: this.cache.peek<HotelbedsContentMeta>(metaKey) ?? cachedMeta,
        entry: this.cache.getEntryMeta(contentKey) ?? contentEntryMeta,
      },
      database: {
        found: imagesInDb > 0 || Boolean(dbContent),
        hasContent: Boolean(dbContent),
        imagesCount: imagesInDb,
        descriptionLength: localizedText(dbContent?.description)?.length ?? 0,
        lastSyncedAt: null,
        provider: 'HOTELBEDS',
        sourceEnvironment: this.config.environment,
        note: 'Accommodation tabulka, provider=HOTELBEDS.',
      },
      currentImageSource,
      imageDelivery: firstImageDelivery,
      lastSuccessfulContentFetch: diagnostics.lastSuccessfulContentRequest?.at ?? cachedMeta?.fetchedAt ?? null,
      images: imageDiagnostics,
      debugSource: {
        contentSource: contentAfterTest || cachedContent ? 'CACHE' : contentStatus === 200 ? 'CONTENT_API' : 'BOOKING_ONLY',
        imageSource: currentImageSource,
        contentApiStatus: contentStatus || null,
        contentFetchedAt: (this.cache.peek<HotelbedsContentMeta>(metaKey) ?? cachedMeta)?.fetchedAt ?? contentEntryMeta?.createdAt ?? null,
        cacheHit: Boolean(contentAfterTest ?? cachedContent),
        dbHit: imagesInDb > 0,
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
      note: 'Diagnostika čte DB, cache, image proxy a API logy.',
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
    hints.push('Hotelbeds content se ukládá do Accommodation (provider=HOTELBEDS).');
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
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}
