import { Injectable } from '@nestjs/common';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsHttpService } from './hotelbeds-http.service';
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

const PUBLIC_TEST_HOTELS: Array<{ label: string; code: number }> = [
  { label: 'Hotel Duo', code: 6741 },
];

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

  async getOverview() {
    const diagnostics = this.metrics.contentDiagnostics();
    const cacheInspection = this.cache.inspect(200);
    const dbHotelCount = await this.contentStorage.countCatalog();
    const catalogStats = await this.contentStorage.getCatalogStats();
    const contentLogs = [
      ...this.metrics.getContentHistory(50),
      ...this.metrics.getContentLogsFromApiLogs(),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 50);

    const hotelsWithImages = this.countHotelsWithImagesFromCache();

    const contentApiStatus = this.metrics.getContentApiAccessStatus();

    return {
      bookingApi: {
        status: diagnostics.bookingApiOk ? 'OK' : 'UNKNOWN',
        httpStatus: diagnostics.bookingApiOk ? 200 : null,
      },
      contentApi: {
        status: contentApiStatus,
        accessStatus: contentApiStatus,
        permissionDenied: diagnostics.contentApiPermissionDenied,
        quotaExceeded: diagnostics.contentApiQuotaExceeded,
        blockedUntil: diagnostics.contentApiBlockedUntil,
      },
      publicFallback: {
        active: diagnostics.publicFallbackActive,
        dbHotelCount,
        note: 'Veřejný katalog čte hotely z DB/cache bez volání Content API.',
      },
      lastSuccessfulContentRequest: diagnostics.lastSuccessfulContentRequest,
      lastFailedContentRequest: diagnostics.lastFailedContentRequest,
      imageSourceCounts: diagnostics.imageSourceCounts,
      hotelsWithPhoto: {
        fromContentApi: diagnostics.imageSourceCounts.contentApi,
        fromCache: hotelsWithImages.inCache,
        fromDatabase: dbHotelCount,
        fallback: diagnostics.imageSourceCounts.fallback,
        withoutPhoto: diagnostics.imageSourceCounts.none,
      },
      database: {
        available: true,
        hotelCount: dbHotelCount,
        catalogStats,
        note: 'Hotelbeds content v tabulce Accommodation (provider=HOTELBEDS).',
      },
      contentHistory: contentLogs,
      cache: cacheInspection,
    };
  }

  getCacheInspector() {
    return this.cache.inspect(500);
  }

  async diagnoseHotel(hotelCode: number) {
    const contentKey = `content:${hotelCode}`;
    const metaKey = `content-meta:${hotelCode}`;

    const cachedContent = this.cache.peek<HbContentHotel>(contentKey);
    const cachedMeta = this.cache.peek<HotelbedsContentMeta>(metaKey);
    const contentEntryMeta = this.cache.getEntryMeta(contentKey);
    const dbContent = await this.contentStorage.getDbDiagnostics(hotelCode);
    const dbHotel = await this.contentStorage.findByProviderId(hotelCode);
    const imagesInDb = dbContent.imagesCount;
    const contentForImages = dbHotel ?? cachedContent;
    const sortedImages = sortHotelbedsImages(contentForImages?.images);

    const metricsDiag = this.metrics.contentDiagnostics();
    const liveContentApi = {
      called: false,
      httpStatus:
        metricsDiag.lastContentRequest?.status ??
        metricsDiag.lastFailedContentRequest?.status ??
        null,
      status: metricsDiag.contentApiQuotaExceeded
        ? 'QUOTA_EXCEEDED'
        : metricsDiag.lastFailedContentRequest
          ? `HTTP_${metricsDiag.lastFailedContentRequest.status}`
          : metricsDiag.contentApiOk
            ? 'OK'
            : 'UNKNOWN',
      error: metricsDiag.lastFailedContentRequest?.errorMessage ?? null,
      endpoint: buildContentHotelsUrl(this.config.contentBaseUrl, [hotelCode], HOTELBEDS_CONTENT_LANGUAGE),
      note: 'Diagnostika hotelu nevolá Content API — zobrazuje poslední známý LIVE stav z metrik.',
    };

    const databaseContent = {
      found: dbContent.found,
      status: dbContent.found ? 'FOUND' : 'NOT_FOUND',
      hotel: dbContent.name,
      imagesCount: imagesInDb,
      imagePaths: dbContent.imagePaths,
      descriptionExists: dbContent.descriptionExists,
      facilitiesCount: dbContent.facilitiesCount,
      address: dbContent.address,
      coordinates: dbContent.coordinates,
      slug: dbContent.slug,
      lastSyncedAt: dbContent.lastSyncedAt,
      provider: 'HOTELBEDS',
      sourceEnvironment: this.config.environment,
    };

    const cacheStatus = {
      hit: Boolean(cachedContent),
      status: cachedContent ? 'HIT' : 'MISS',
      contentKey,
      imagesInCache: sortHotelbedsImages(cachedContent?.images).length,
      meta: this.cache.peek<HotelbedsContentMeta>(metaKey) ?? cachedMeta,
      entry: this.cache.getEntryMeta(contentKey) ?? contentEntryMeta,
    };

    const currentImageSource =
      imagesInDb > 0
        ? cacheStatus.hit
          ? 'DATABASE_CACHE'
          : 'DATABASE'
        : sortedImages.length
          ? cacheStatus.hit
            ? 'HOTELBEDS_CACHE'
            : 'NONE'
          : 'NONE';

    const firstImageDelivery = await this.imageService.probeDelivery(hotelCode, 0, 'card');
    const imageDiagnostics = await Promise.all(
      sortedImages.slice(0, 8).map(async (_img, idx) => {
        const delivery = await this.imageService.probeDelivery(hotelCode, idx, 'card');
        return {
          rawPath: sortedImages[idx]?.path ?? null,
          assembledUrl: delivery.resolvedUrl,
          proxyUrl: delivery.proxyUrl,
          httpStatus: delivery.httpStatus,
          contentType: delivery.contentType,
          folder: delivery.folder,
          imageTypeCode: sortedImages[idx]?.imageTypeCode ?? null,
          source: currentImageSource,
        };
      }),
    );

    const authOk = Boolean(this.http.getCredentials());
    const statusBoard = {
      AUTH: authOk ? 'OK' : 'MISSING_CREDENTIALS',
      BOOKING_API: metricsDiag.bookingApiOk ? 'OK' : 'UNKNOWN',
      CONTENT_API: liveContentApi.status,
      CONTENT_DB: databaseContent.found ? 'OK' : 'EMPTY',
      HOTEL_IMAGES: imagesInDb || sortedImages.length,
      IMAGE_DELIVERY:
        firstImageDelivery.httpStatus === 200
          ? 'OK 200'
          : firstImageDelivery.httpStatus
            ? `ERROR ${firstImageDelivery.httpStatus}`
            : 'UNKNOWN',
      CACHE: cacheStatus.status,
      EFFECTIVE_SOURCE: currentImageSource,
    };

    return {
      hotelId: hotelCode,
      name: dbContent.name ?? localizedText(cachedContent?.name) ?? null,
      statusBoard,
      liveContentApi,
      databaseContent,
      cache: cacheStatus,
      database: {
        found: databaseContent.found,
        hasContent: databaseContent.found,
        imagesCount: imagesInDb,
        descriptionLength: dbContent.descriptionExists ? 1 : 0,
        lastSyncedAt: dbContent.lastSyncedAt,
        provider: 'HOTELBEDS',
        sourceEnvironment: this.config.environment,
        note: 'Accommodation tabulka, provider=HOTELBEDS.',
      },
      contentApi: {
        httpStatus: liveContentApi.httpStatus ?? 0,
        ok: liveContentApi.status === 'OK',
        permissionDenied: metricsDiag.contentApiPermissionDenied,
        quotaExceeded: metricsDiag.contentApiQuotaExceeded,
        blockedUntil: metricsDiag.contentApiBlockedUntil,
        error: liveContentApi.error,
        endpoint: liveContentApi.endpoint,
        language: HOTELBEDS_CONTENT_LANGUAGE,
        called: false,
      },
      currentImageSource,
      effectiveSource: currentImageSource,
      imageDelivery: firstImageDelivery,
      lastSuccessfulContentFetch: metricsDiag.lastSuccessfulContentRequest?.at ?? cachedMeta?.fetchedAt ?? null,
      images: imageDiagnostics,
      debugSource: {
        contentSource: databaseContent.found ? 'DATABASE' : cacheStatus.hit ? 'CACHE' : 'NONE',
        imageSource: currentImageSource,
        contentApiStatus: liveContentApi.httpStatus,
        contentFetchedAt: cachedMeta?.fetchedAt ?? contentEntryMeta?.createdAt ?? null,
        cacheHit: cacheStatus.hit,
        dbHit: databaseContent.found,
        fallbackUsed: metricsDiag.publicFallbackActive,
      },
      conclusionHints: this.buildConclusionHints({
        cachedContent: cachedContent ?? undefined,
        cachedMeta: cachedMeta ?? undefined,
        databaseContent,
        currentImageSource,
        quotaExceeded: metricsDiag.contentApiQuotaExceeded,
        lastSuccess: metricsDiag.lastSuccessfulContentRequest,
      }),
    };
  }

  async diagnosePublicHotels() {
    const hotels = [];
    for (const target of PUBLIC_TEST_HOTELS) {
      hotels.push(await this.diagnosePublicHotelFlow(target.code, target.label));
    }

    return {
      testedAt: new Date().toISOString(),
      hotels,
      note: 'Test veřejného flow: DB, cache, image proxy, public API — bez volání Content API.',
    };
  }

  private async diagnosePublicHotelFlow(hotelCode: number, label: string) {
    const dbContent = await this.contentStorage.getDbDiagnostics(hotelCode);
    const cacheContent = this.cache.peek<HbContentHotel>(`content:${hotelCode}`);
    const cacheHit = Boolean(cacheContent);
    const imagesInCache = sortHotelbedsImages(cacheContent?.images).length;
    const imageDelivery = await this.imageService.probeDelivery(hotelCode, 0, 'card');

    let publicApiOk = false;
    let publicApiError: string | null = null;
    try {
      if (dbContent.slug) {
        await this.publicService.getBySlug(dbContent.slug);
        publicApiOk = true;
      } else {
        const search = await this.publicService.search({ catalog: true, limit: 100, page: 1 });
        publicApiOk = search.items.some((h) => h.providerId === String(hotelCode));
        if (!publicApiOk) {
          publicApiError = 'Hotel není v public catalog response.';
        }
      }
    } catch (err) {
      publicApiError = err instanceof Error ? err.message : String(err);
    }

    const currentImageSource =
      dbContent.imagesCount > 0
        ? cacheHit
          ? 'DATABASE_CACHE'
          : 'DATABASE'
        : cacheHit
          ? 'HOTELBEDS_CACHE'
          : 'NONE';

    return {
      label,
      hotelId: hotelCode,
      database: {
        found: dbContent.found ? 'FOUND' : 'NOT_FOUND',
        imagesCount: dbContent.imagesCount,
        name: dbContent.name,
      },
      cache: {
        hit: cacheHit ? 'HIT' : 'MISS',
        imagesInCache,
      },
      images: dbContent.imagesCount,
      imageDelivery: {
        proxyUrl: imageDelivery.proxyUrl,
        httpStatus: imageDelivery.httpStatus,
        contentType: imageDelivery.contentType,
      },
      publicApi: {
        ok: publicApiOk ? 'OK' : 'ERROR',
        error: publicApiError,
      },
      currentImageSource,
      contentApi: 'NOT_CALLED',
    };
  }

  private buildConclusionHints(input: {
    cachedContent?: HbContentHotel;
    cachedMeta?: HotelbedsContentMeta;
    databaseContent: { found: boolean; imagesCount: number };
    currentImageSource: string;
    quotaExceeded: boolean;
    lastSuccess: { at: string; imagesCount: number } | null;
  }) {
    const hints: string[] = [];
    if (input.databaseContent.found && input.databaseContent.imagesCount > 0) {
      hints.push(
        `V DB je uložený obsah s ${input.databaseContent.imagesCount} fotografiemi — veřejný katalog může fungovat bez Content API.`,
      );
    } else {
      hints.push('V DB nejsou fotografie pro tento hotel.');
    }
    if (input.cachedContent && (input.cachedContent.images?.length ?? 0) > 0) {
      hints.push('V in-memory cache existuje obsah s fotografiemi.');
    }
    if (input.quotaExceeded) {
      hints.push('Content API quota exceeded — circuit breaker aktivní, používá se DB/cache.');
    }
    if (input.lastSuccess) {
      hints.push(
        `Poslední úspěšný Content API request: ${input.lastSuccess.at} (${input.lastSuccess.imagesCount} obrázků).`,
      );
    }
    if (input.cachedMeta) {
      hints.push(`Cache metadata: ${input.cachedMeta.fetchedAt} ze zdroje ${input.cachedMeta.source}.`);
    }
    hints.push(`Aktuální efektivní zdroj: ${input.currentImageSource}.`);
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
