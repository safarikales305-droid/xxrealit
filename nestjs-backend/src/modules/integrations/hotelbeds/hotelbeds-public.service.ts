import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsCurrencyService } from './hotelbeds-currency.service';
import { defaultSearchDates, resolveDestination } from './hotelbeds-destinations';
import { HotelbedsHttpError, HotelbedsHttpService } from './hotelbeds-http.service';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import { categoryMatchesFilter, mapHotelbedsToCategory } from './hotelbeds-category.mapper';
import {
  HOTELBEDS_BATCH_MAX,
  HOTELBEDS_CONTENT_BATCH_SIZE,
  HOTELBEDS_CONTENT_LANGUAGE,
  HOTELBEDS_PAGE_SIZE,
  buildContentHotelsUrl,
  cancellationSummary,
  facilityFlags,
  hotelSlug,
  localizedText,
  parseContentHotelsResponse,
  parseHotelCodeFromSlug,
  sortHotelbedsImages,
  starsFromCategory,
  summarizeContentResponse,
  type HbBookingHotel,
  type HbContentHotel,
} from './hotelbeds-normalizer';
import { HotelbedsContentStorageService } from './hotelbeds-content-storage.service';
import { isQuotaExceededMessage } from './hotelbeds-content-api-status.util';
import { HotelbedsImageService } from './hotelbeds-image.service';
import type { HotelbedsContentMeta, HotelbedsDebugSource } from './hotelbeds-content-meta.types';
import type {
  HotelbedsPublicConfig,
  HotelbedsSearchQuery,
  HotelbedsSearchResponse,
  NormalizedAccommodation,
} from './hotelbeds-normalized.types';

const CACHE_SEARCH_MS = 8 * 60 * 1000;
const CACHE_CONTENT_MS = 24 * 60 * 60 * 1000;
const CACHE_DETAIL_MS = 6 * 60 * 60 * 1000;
const CACHE_AVAIL_MS = 5 * 60 * 1000;

type BookingSearchPayload = {
  hotels?: { hotels?: HbBookingHotel[]; total?: number };
  error?: { code?: string; message?: string };
};

type ContentHotelsPayload = Record<string, unknown>;

@Injectable()
export class HotelbedsPublicService {
  private readonly log = new Logger(HotelbedsPublicService.name);

  constructor(
    private readonly config: HotelbedsConfigService,
    private readonly http: HotelbedsHttpService,
    private readonly currency: HotelbedsCurrencyService,
    private readonly cache: HotelbedsCacheService,
    private readonly metrics: HotelbedsMetricsService,
    private readonly contentStorage: HotelbedsContentStorageService,
    private readonly imageService: HotelbedsImageService,
  ) {}

  getPublicConfig(): HotelbedsPublicConfig {
    const diagnostics = this.metrics.contentDiagnostics();
    return {
      publicListings: this.config.publicListings,
      bookingEnabled: this.config.bookingEnabled,
      environment: this.config.environment,
      contentApiAvailable: diagnostics.contentApiOk && !diagnostics.contentApiPermissionDenied,
      dbContentFallback: true,
    };
  }

  async search(query: HotelbedsSearchQuery): Promise<HotelbedsSearchResponse> {
    if (!this.config.publicListings) {
      throw new ServiceUnavailableException('Hotelbeds public listings are disabled.');
    }
    if (!this.http.getCredentials()) {
      throw new ServiceUnavailableException('Hotelbeds není nakonfigurován.');
    }

    const defaults = defaultSearchDates();
    const checkIn = query.checkIn || defaults.checkIn;
    const checkOut = query.checkOut || defaults.checkOut;
    const adults = Math.max(1, query.adults ?? 2);
    const rooms = Math.max(1, query.rooms ?? 1);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(HOTELBEDS_BATCH_MAX, Math.max(1, query.limit ?? HOTELBEDS_PAGE_SIZE));
    const destination = resolveDestination(query.destination);

    const cacheKey = `search:${destination.label}:${checkIn}:${checkOut}:${adults}:${rooms}:${query.category ?? ''}:${query.starsMin ?? ''}:${query.priceMax ?? ''}:${query.wifi ? 1 : 0}:${query.parking ? 1 : 0}:${query.breakfast ? 1 : 0}:${query.wellness ? 1 : 0}:${query.pool ? 1 : 0}:${query.pets ? 1 : 0}:${query.accessible ? 1 : 0}:${page}:${limit}:${query.catalog ? 'catalog' : 'avail'}`;
    const cached = this.cache.get<HotelbedsSearchResponse>(cacheKey);
    if (cached) return this.toPublicResponse(cached);

    if (query.catalog !== false) {
      const catalogResponse = await this.searchCatalog(query, checkIn, checkOut, destination.label);
      this.cache.set(cacheKey, catalogResponse, CACHE_SEARCH_MS);
      return this.toPublicResponse(catalogResponse);
    }

    try {
      let allItems = await this.loadSearchBatch(destination, checkIn, checkOut, adults, rooms, query);
      if (!allItems.length) {
        const catalogFallback = await this.searchCatalog(query, checkIn, checkOut, destination.label);
        allItems = catalogFallback.items;
      }
      const filtered = this.applySearchFilters(allItems, query);
      const total = filtered.length;
      const start = (page - 1) * limit;
      const pageHotels = filtered.slice(start, start + limit);

      const response: HotelbedsSearchResponse = {
        items: pageHotels,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        checkIn,
        checkOut,
        destination: destination.label,
        source: 'HOTELBEDS',
      };

      this.metrics.recordSearch(destination.label, total);
      this.cache.set(cacheKey, response, CACHE_SEARCH_MS);
      return this.toPublicResponse(response);
    } catch (err) {
      this.log.warn(`Hotelbeds search failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof HotelbedsHttpError) {
        const fallback = await this.searchCatalog(query, checkIn, checkOut, destination.label);
        if (fallback.total > 0) {
          this.log.warn(`Booking API HTTP ${err.status} — returning ${fallback.total} hotels from DB catalog.`);
          return this.toPublicResponse(fallback);
        }
        throw new ServiceUnavailableException(this.mapPublicError(err.status, err.errorBody));
      }
      throw new ServiceUnavailableException('Ubytování se momentálně nepodařilo načíst. Zkuste to prosím za chvíli.');
    }
  }

  private async searchCatalog(
    query: HotelbedsSearchQuery,
    checkIn: string,
    checkOut: string,
    destinationLabel: string,
  ): Promise<HotelbedsSearchResponse> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(HOTELBEDS_BATCH_MAX, Math.max(1, query.limit ?? HOTELBEDS_PAGE_SIZE));
    const destination = resolveDestination(query.destination);
    const cityFilter = query.destination?.trim() ? destination.label : undefined;

    const { items: contentHotels, total: dbTotal } = await this.contentStorage.listCatalog({
      category: query.category,
      city: cityFilter,
      page,
      limit,
    });

    const cacheHits = contentHotels.filter((h) =>
      h.code != null ? this.cache.has(`content:${h.code}`) : false,
    ).length;

    const merged = await Promise.all(
      contentHotels.map((content) =>
        this.mergeHotel(
          { code: content.code, name: localizedText(content.name) ?? undefined },
          content,
          checkIn,
          checkOut,
          { catalogOnly: true },
        ),
      ),
    );
    const filtered = this.applySearchFilters(
      merged.filter((h): h is NormalizedAccommodation => h != null),
      query,
    );

    const finalTotal = query.category || cityFilter ? filtered.length : dbTotal;
    this.log.log(
      JSON.stringify({
        event: 'PUBLIC_HOTEL_REQUEST',
        source: 'DATABASE',
        dbContent: dbTotal,
        cacheHits,
        bookingApi: 'NOT_REQUIRED',
        contentApi: 'NOT_CALLED',
        finalResults: filtered.length,
        total: finalTotal,
        page,
        limit,
        category: query.category ?? null,
        city: cityFilter ?? null,
      }),
    );

    return {
      items: filtered,
      total: finalTotal,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil((query.category || cityFilter ? filtered.length : dbTotal) / limit)),
      checkIn,
      checkOut,
      destination: destinationLabel,
      source: 'HOTELBEDS',
    };
  }

  private async loadSearchBatch(
    destination: ReturnType<typeof resolveDestination>,
    checkIn: string,
    checkOut: string,
    adults: number,
    rooms: number,
    query: HotelbedsSearchQuery,
  ): Promise<NormalizedAccommodation[]> {
    const batchKey = `search-batch:${destination.label}:${checkIn}:${checkOut}:${adults}:${rooms}`;
    const cached = this.cache.get<NormalizedAccommodation[]>(batchKey);
    if (cached) return cached;

    const bookingUrl = `${this.config.bookingBaseUrl}/hotels`;
    const body = {
      stay: { checkIn, checkOut },
      occupancies: [{ rooms, adults, children: query.children ?? 0 }],
      geolocation: {
        latitude: query.latitude ?? destination.latitude,
        longitude: query.longitude ?? destination.longitude,
        radius: destination.radiusKm,
        unit: 'km',
      },
      filter: { maxHotels: HOTELBEDS_BATCH_MAX },
    };

    const { data } = await this.http.postJson<BookingSearchPayload>(bookingUrl, body, 'booking/search');
    const bookingHotels = data.hotels?.hotels ?? [];
    const codes = bookingHotels.map((h) => h.code).filter((c): c is number => c != null);
    const contentMap = await this.getContentsFromPersistence(codes);
    const dbHits = contentMap.size;

    const merged = await Promise.all(
      bookingHotels.map(async (bh) =>
        this.mergeHotel(bh, contentMap.get(String(bh.code)), checkIn, checkOut),
      ),
    );
    const filtered = merged.filter((h): h is NormalizedAccommodation => h != null);

    this.log.log(
      JSON.stringify({
        event: 'PUBLIC_HOTEL_REQUEST',
        source: 'BOOKING_DB_MERGE',
        bookingHotels: bookingHotels.length,
        dbContentHits: dbHits,
        bookingApi: 'OK',
        contentApi: 'NOT_CALLED',
        finalResults: filtered.length,
      }),
    );

    this.cache.set(batchKey, filtered, CACHE_SEARCH_MS);
    return filtered;
  }

  private applySearchFilters(items: NormalizedAccommodation[], query: HotelbedsSearchQuery) {
    return items.filter((h) => {
      if (query.category && !categoryMatchesFilter(h.xxrealitCategory as never, query.category)) {
        return false;
      }
      if (query.starsMin && (h.stars ?? 0) < query.starsMin) return false;
      if (query.priceMax && (h.priceFrom ?? Infinity) > query.priceMax) return false;
      // Facility flags vyžadují Content API — bez enrichmentu je nefiltrujeme
      if (h.contentEnriched) {
        if (query.wifi && !h.wifi) return false;
        if (query.parking && !h.parking) return false;
        if (query.breakfast && !h.breakfast) return false;
        if (query.wellness && !h.wellness) return false;
        if (query.pool && !h.pool) return false;
        if (query.pets && !h.petsAllowed) return false;
        if (query.accessible && !h.accessible) return false;
      }
      if (query.ratingMin && (h.rating ?? 0) < query.ratingMin) return false;
      return true;
    });
  }

  async getDbHotelSummary(hotelCode: number) {
    return this.contentStorage.getDbDiagnostics(hotelCode);
  }

  async getBySlug(slug: string, query?: Partial<HotelbedsSearchQuery>): Promise<NormalizedAccommodation> {
    const code = parseHotelCodeFromSlug(slug);
    if (!code) throw new NotFoundException('Hotel nenalezen.');

    const defaults = defaultSearchDates();
    const checkIn = query?.checkIn || defaults.checkIn;
    const checkOut = query?.checkOut || defaults.checkOut;
    const cacheKey = `detail:${code}:${checkIn}:${checkOut}:${query?.adults ?? 2}:${query?.rooms ?? 1}`;
    const cached = this.cache.get<NormalizedAccommodation>(cacheKey);
    if (cached) return this.toPublicItem(cached);

    let bookingHotel: HbBookingHotel | undefined;
    try {
      bookingHotel = await this.fetchAvailabilityForHotel(
        Number(code),
        checkIn,
        checkOut,
        query?.adults ?? 2,
        query?.rooms ?? 1,
      );
    } catch {
      bookingHotel = undefined;
    }

    const contentMap = await this.getContentsFromPersistence([Number(code)]);
    const content = contentMap.get(code);

    if (!content) {
      throw new NotFoundException('Hotel nenalezen.');
    }

    const merged = await this.mergeHotel(
      bookingHotel ?? { code: Number(code), name: localizedText(content?.name) ?? undefined },
      content,
      checkIn,
      checkOut,
      {
        catalogOnly:
          !bookingHotel ||
          !((bookingHotel.rooms?.length ?? 0) > 0 || bookingHotel.minRate != null),
      },
    );
    if (!merged) throw new NotFoundException('Hotel nenalezen.');

    this.cache.set(cacheKey, merged, CACHE_DETAIL_MS);
    return this.toPublicItem(merged);
  }

  async streamHotelImage(
    res: import('express').Response,
    hotelId: number,
    index: number,
    size?: string,
  ): Promise<void> {
    const allowed: Array<import('./hotelbeds-normalizer').HotelbedsImageSize> = [
      'thumbnail',
      'card',
      'detail',
      'hero',
    ];
    const resolvedSize = allowed.includes(size as never) ? (size as import('./hotelbeds-normalizer').HotelbedsImageSize) : 'card';
    await this.imageService.streamImage(res, hotelId, index, resolvedSize);
  }

  async getImageDeliveryDiagnostics(hotelId: number, index = 0) {
    return this.imageService.probeDelivery(hotelId, index, 'card');
  }

  async getBySlugWithDebug(
    slug: string,
    query?: Partial<HotelbedsSearchQuery>,
  ): Promise<NormalizedAccommodation> {
    const code = parseHotelCodeFromSlug(slug);
    if (!code) throw new NotFoundException('Hotel nenalezen.');

    const defaults = defaultSearchDates();
    const checkIn = query?.checkIn || defaults.checkIn;
    const checkOut = query?.checkOut || defaults.checkOut;

    let bookingHotel: HbBookingHotel | undefined;
    try {
      bookingHotel = await this.fetchAvailabilityForHotel(
        Number(code),
        checkIn,
        checkOut,
        query?.adults ?? 2,
        query?.rooms ?? 1,
      );
    } catch {
      bookingHotel = undefined;
    }

    const contentMap = await this.getContentsFromPersistence([Number(code)]);
    const content = contentMap.get(code);
    if (!content) {
      throw new NotFoundException('Hotel nenalezen.');
    }

    const merged = await this.mergeHotel(
      bookingHotel ?? { code: Number(code), name: localizedText(content?.name) ?? undefined },
      content,
      checkIn,
      checkOut,
    );
    if (!merged) throw new NotFoundException('Hotel nenalezen.');
    return merged;
  }

  async getSimilar(slug: string, query?: Partial<HotelbedsSearchQuery>): Promise<NormalizedAccommodation[]> {
    const detail = await this.getBySlug(slug, query);
    const search = await this.search({
      destination: detail.city,
      checkIn: detail.checkIn,
      checkOut: detail.checkOut,
      adults: query?.adults ?? 2,
      rooms: query?.rooms ?? 1,
      limit: 8,
      catalog: true,
    });
    return search.items.filter((h) => h.slug !== slug).slice(0, 6).map((i) => this.toPublicItem(i));
  }

  /** Veřejný flow: DB → cache. Content API se NEVOLÁ. */
  private async getContentsFromPersistence(codes: number[]): Promise<Map<string, HbContentHotel>> {
    const map = new Map<string, HbContentHotel>();
    if (!codes.length) return map;

    const unique = [...new Set(codes)].filter((c) => Number.isFinite(c) && c > 0);
    for (const code of unique) {
      const dbContent = await this.contentStorage.findByProviderId(code);
      if (dbContent) {
        map.set(String(code), dbContent);
        this.cache.set(`content:${code}`, dbContent, CACHE_CONTENT_MS);
        this.metrics.recordImageSource('database');
        continue;
      }
      const cached = this.cache.peek<HbContentHotel>(`content:${code}`);
      if (cached) {
        map.set(String(code), cached);
        this.metrics.recordImageSource('cache');
      }
    }
    return map;
  }

  /**
   * @deprecated Používejte getContentsFromPersistence pro veřejný katalog.
   * Volá Content API jen pokud není circuit breaker a data chybí v DB/cache.
   */
  private async safeGetHotelContents(codes: number[]): Promise<Map<string, HbContentHotel>> {
    const map = await this.getContentsFromPersistence(codes);
    if (!codes.length || this.metrics.isContentApiDisabled()) {
      return map;
    }

    const missing = codes.filter((c) => !map.has(String(c)));
    if (!missing.length) return map;

    try {
      const fresh = await this.getHotelContents(missing, { force: false });
      for (const [k, v] of fresh) map.set(k, v);
    } catch (err) {
      this.log.warn(
        `Content enrichment skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return map;
  }

  async getHotelContents(
    codes: number[],
    opts?: { skipCache?: boolean; force?: boolean },
  ): Promise<Map<string, HbContentHotel>> {
    const map = new Map<string, HbContentHotel>();
    if (!codes.length) return map;
    if (!opts?.force && this.metrics.isContentApiDisabled()) return map;

    const unique = [...new Set(codes)].filter((c) => Number.isFinite(c) && c > 0);
    const missing: number[] = [];
    for (const code of unique) {
      if (!opts?.skipCache) {
        const cached = this.cache.peek<HbContentHotel>(`content:${code}`);
        if (cached) {
          map.set(String(code), cached);
          continue;
        }
      }
      missing.push(code);
    }
    if (!missing.length) return map;

    for (let i = 0; i < missing.length; i += HOTELBEDS_CONTENT_BATCH_SIZE) {
      const batch = missing.slice(i, i + HOTELBEDS_CONTENT_BATCH_SIZE);
      const batchKey = `content-batch:${batch.slice().sort((a, b) => a - b).join(',')}`;
      try {
        const hotels = await this.fetchContentBatch(batch, batchKey, opts?.skipCache);
        let withImages = 0;
        for (const hotel of hotels) {
          if (hotel.code == null) continue;
          this.storeContentCache(hotel, 'CONTENT_API');
          try {
            await this.contentStorage.upsertFromContent(hotel);
          } catch (err) {
            this.log.warn(
              `DB persist failed for hotel ${hotel.code}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          map.set(String(hotel.code), hotel);
          if ((hotel.images?.length ?? 0) > 0) withImages++;
        }
        this.metrics.recordContentSync(hotels.length, withImages);
        this.metrics.recordContentHistory({
          hotelIds: hotels.map((h) => h.code).filter((c): c is number => c != null),
          endpoint: 'content/hotels',
          httpStatus: 200,
          imagesCount: withImages,
          source: 'CONTENT_API',
          responseTimeMs: 0,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const body = err instanceof HotelbedsHttpError ? err.errorBody : undefined;
        const status = err instanceof HotelbedsHttpError ? err.status : 0;
        if (status >= 400) {
          if (status === 403 && isQuotaExceededMessage(body ?? msg)) {
            this.metrics.markContentApiQuotaExceeded();
          }
          this.metrics.recordContentHistory({
            hotelIds: batch,
            endpoint: 'content/hotels',
            httpStatus: status,
            imagesCount: 0,
            source: 'CONTENT_API',
            responseTimeMs: err instanceof HotelbedsHttpError ? err.responseTimeMs : 0,
            errorCode: String(status),
            errorMessage: body ?? msg,
          });
        }
        this.log.warn(
          `Content fetch failed for batch of ${batch.length} hotels: ${msg}${body ? ` | ${body.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`,
        );
      }
    }
    return map;
  }

  async testHotelContent(hotelCode = 6741) {
    const databaseContent = await this.contentStorage.getDbDiagnostics(hotelCode);
    const cacheContent = this.cache.peek<HbContentHotel>(`content:${hotelCode}`);
    const cacheImages = sortHotelbedsImages(cacheContent?.images);
    const effectiveSource =
      databaseContent.imagesCount > 0
        ? cacheContent
          ? 'DATABASE_CACHE'
          : 'DATABASE'
        : cacheContent
          ? 'HOTELBEDS_CACHE'
          : 'NONE';

    const quotaBlocked = this.metrics.isContentApiQuotaBlocked();
    if (quotaBlocked || this.metrics.isContentApiDisabled()) {
      const diag = this.metrics.contentDiagnostics();
      return this.buildTestHotelContentResponse({
        hotelCode,
        databaseContent,
        cache: { hit: Boolean(cacheContent), imagesInCache: cacheImages.length },
        liveContentApi: {
          called: false,
          skipped: true,
          httpStatus: diag.lastFailedContentRequest?.status ?? 403,
          status: quotaBlocked ? 'QUOTA_EXCEEDED' : 'BLOCKED',
          error:
            diag.lastFailedContentRequest?.errorMessage ??
            'Content API je dočasně blokováno — používá se DB/cache.',
        },
        effectiveSource,
      });
    }

    try {
      const { hotels, raw, language } = await this.fetchContentBatchWithRaw(
        [hotelCode],
        `test-content-${hotelCode}`,
        true,
        true,
      );
      const hotel = hotels.find((h) => String(h.code) === String(hotelCode)) ?? hotels[0];
      const images = sortHotelbedsImages(hotel?.images);
      const summary = summarizeContentResponse(raw, hotelCode);
      if (hotel) {
        this.storeContentCache(hotel, 'CONTENT_API');
        await this.contentStorage.upsertFromContent(hotel, language);
      }
      return this.buildTestHotelContentResponse({
        hotelCode,
        databaseContent: await this.contentStorage.getDbDiagnostics(hotelCode),
        cache: {
          hit: Boolean(this.cache.peek(`content:${hotelCode}`)),
          imagesInCache: images.length,
        },
        liveContentApi: {
          called: true,
          skipped: false,
          httpStatus: 200,
          status: 'OK',
          name: localizedText(hotel?.name),
          descriptionExists: Boolean(localizedText(hotel?.description)),
          imagesCount: images.length,
          imagesRawCount: summary.imagesRawCount,
          facilitiesCount: hotel?.facilities?.length ?? 0,
          category: hotel?.categoryCode ?? hotel?.category?.code ?? null,
          language,
          addressExists: Boolean(hotel?.address?.street || hotel?.address?.content),
          coordinatesExist: Boolean(hotel?.coordinates?.latitude && hotel?.coordinates?.longitude),
          rawSummary: summary,
        },
        effectiveSource,
      });
    } catch (err) {
      const status = err instanceof HotelbedsHttpError ? err.status : 0;
      const body = err instanceof HotelbedsHttpError ? err.errorBody : undefined;
      const quotaExceeded = status === 403 && isQuotaExceededMessage(body ?? '');
      if (quotaExceeded) {
        this.metrics.markContentApiQuotaExceeded();
      } else if (status === 401 || status === 403) {
        this.metrics.markContentApiPermissionDenied();
      }
      return this.buildTestHotelContentResponse({
        hotelCode,
        databaseContent,
        cache: { hit: Boolean(cacheContent), imagesInCache: cacheImages.length },
        liveContentApi: {
          called: true,
          skipped: false,
          httpStatus: status,
          status: quotaExceeded ? 'QUOTA_EXCEEDED' : status ? `HTTP_${status}` : 'ERROR',
          error:
            err instanceof HotelbedsHttpError
              ? err.errorBody ?? err.message
              : String(err),
        },
        effectiveSource,
      });
    }
  }

  private buildTestHotelContentResponse(input: {
    hotelCode: number;
    databaseContent: Awaited<ReturnType<HotelbedsContentStorageService['getDbDiagnostics']>>;
    cache: { hit: boolean; imagesInCache: number };
    liveContentApi: Record<string, unknown>;
    effectiveSource: string;
  }) {
    const live = input.liveContentApi;
    const db = input.databaseContent;
    return {
      success: Boolean(db.found) || live.httpStatus === 200,
      permissionDenied: live.status === 'QUOTA_EXCEEDED' || live.status === 'BLOCKED',
      quotaExceeded: live.status === 'QUOTA_EXCEEDED',
      hotelCode: input.hotelCode,
      effectiveSource: input.effectiveSource,
      databaseContent: db,
      cache: input.cache,
      liveContentApi: live,
      httpStatus: (live.httpStatus as number) ?? 0,
      name: (live.name as string | null) ?? db.name,
      descriptionExists: (live.descriptionExists as boolean | undefined) ?? db.descriptionExists,
      imagesCount: db.imagesCount > 0 ? db.imagesCount : ((live.imagesCount as number) ?? 0),
      imagesRawCount: (live.imagesRawCount as number | undefined) ?? db.imagesCount,
      facilitiesCount:
        db.facilitiesCount > 0 ? db.facilitiesCount : ((live.facilitiesCount as number) ?? 0),
      category: (live.category as string | null) ?? null,
      language: (live.language as string | null) ?? HOTELBEDS_CONTENT_LANGUAGE,
      addressExists: (live.addressExists as boolean | undefined) ?? Boolean(db.address),
      coordinatesExist:
        (live.coordinatesExist as boolean | undefined) ?? Boolean(db.coordinates),
      rawSummary: live.rawSummary ?? null,
      error: (live.error as string | undefined) ?? null,
    };
  }

  async getRawContentDiagnostics(hotelCode = 6741, opts?: { forceLive?: boolean }) {
    const databaseContent = await this.contentStorage.getDbDiagnostics(hotelCode);
    if (!opts?.forceLive && this.metrics.isContentApiDisabled()) {
      const diag = this.metrics.contentDiagnostics();
      return {
        httpStatus: diag.lastFailedContentRequest?.status ?? 403,
        skipped: true,
        quotaExceeded: this.metrics.isContentApiQuotaBlocked(),
        language: HOTELBEDS_CONTENT_LANGUAGE,
        endpoint: buildContentHotelsUrl(this.config.contentBaseUrl, [hotelCode]),
        hotelFound: databaseContent.found,
        error: diag.lastFailedContentRequest?.errorMessage ?? 'Content API blocked — using DB/cache',
        databaseContent,
        contentApi: 'NOT_CALLED',
      };
    }
    try {
      const { hotels, raw, language, endpoint } = await this.fetchContentBatchWithRaw(
        [hotelCode],
        `raw-content-${hotelCode}`,
        true,
        true,
      );
      const hotel = hotels.find((h) => String(h.code) === String(hotelCode)) ?? hotels[0];
      const images = sortHotelbedsImages(hotel?.images);
      const delivery = await this.imageService.probeDelivery(hotelCode, 0, 'card');
      const dbImages = await this.contentStorage.countImages(hotelCode);
      return {
        httpStatus: 200,
        language,
        endpoint,
        hotelFound: Boolean(hotel),
        contentLanguage: language,
        imagesReturnedByApi: images.length,
        imagesRawCount: hotel?.images?.length ?? 0,
        imagesParsedCount: images.length,
        firstImageRawPath: images[0]?.path ?? null,
        generatedImageUrl: delivery.resolvedUrl,
        imageHttpStatus: delivery.httpStatus,
        imageProxyUrl: delivery.proxyUrl,
        imageContentType: delivery.contentType,
        imageDeliveryFolder: delivery.folder,
        dbContentFound: dbImages > 0,
        imagesInDb: dbImages,
        rawSummary: summarizeContentResponse(raw, hotelCode),
      };
    } catch (err) {
      const status = err instanceof HotelbedsHttpError ? err.status : 0;
      const body = err instanceof HotelbedsHttpError ? err.errorBody : undefined;
      if (status === 403 && isQuotaExceededMessage(body ?? '')) {
        this.metrics.markContentApiQuotaExceeded();
      }
      return {
        httpStatus: status,
        language: HOTELBEDS_CONTENT_LANGUAGE,
        endpoint: buildContentHotelsUrl(this.config.contentBaseUrl, [hotelCode]),
        hotelFound: databaseContent.found,
        databaseContent,
        error: err instanceof HotelbedsHttpError ? err.errorBody ?? err.message : String(err),
        rawSummary: null,
      };
    }
  }

  private async fetchContentBatch(
    codes: number[],
    cacheKey: string,
    skipCache?: boolean,
    force?: boolean,
  ): Promise<HbContentHotel[]> {
    const result = await this.fetchContentBatchWithRaw(codes, cacheKey, skipCache, force);
    return result.hotels;
  }

  private async fetchContentBatchWithRaw(
    codes: number[],
    cacheKey: string,
    skipCache?: boolean,
    force?: boolean,
  ): Promise<{
    hotels: HbContentHotel[];
    raw: ContentHotelsPayload;
    language: string;
    endpoint: string;
  }> {
    if (!force && this.metrics.isContentApiDisabled()) {
      return { hotels: [], raw: {}, language: HOTELBEDS_CONTENT_LANGUAGE, endpoint: '' };
    }

    const language = HOTELBEDS_CONTENT_LANGUAGE;
    const url = buildContentHotelsUrl(this.config.contentBaseUrl, codes, language);
    const data = await this.http.getJson<ContentHotelsPayload>(url, {
      cacheKey: skipCache ? undefined : cacheKey,
      cacheTtlMs: skipCache ? undefined : CACHE_CONTENT_MS,
      label: 'content/hotels',
    });
    const hotels = parseContentHotelsResponse(data);
    return { hotels, raw: data, language, endpoint: url.replace(this.config.contentBaseUrl, 'content') };
  }

  private storeContentCache(hotel: HbContentHotel, source: HotelbedsContentMeta['source']): void {
    if (hotel.code == null) return;
    const imagesCount = hotel.images?.length ?? 0;
    this.cache.set(`content:${hotel.code}`, hotel, CACHE_CONTENT_MS);
    const meta: HotelbedsContentMeta = {
      fetchedAt: new Date().toISOString(),
      source,
      imagesCount,
      hotelCode: hotel.code,
    };
    this.cache.set(`content-meta:${hotel.code}`, meta, CACHE_CONTENT_MS);
  }

  private buildDebugSource(code: number, content?: HbContentHotel): HotelbedsDebugSource {
    const cacheHit = this.cache.has(`content:${code}`);
    const meta = this.cache.peek<HotelbedsContentMeta>(`content-meta:${code}`);
    const diagnostics = this.metrics.contentDiagnostics();
    const sortedImages = sortHotelbedsImages(content?.images);
    const hasImages = sortedImages.length > 0;
    let imageSource: HotelbedsDebugSource['imageSource'] = 'NONE';
    if (hasImages) {
      imageSource = cacheHit ? 'HOTELBEDS_CACHE' : 'HOTELBEDS_CONTENT_API';
      this.metrics.recordImageSource(cacheHit ? 'cache' : 'contentApi');
    } else {
      this.metrics.recordImageSource('none');
    }
    let contentSource: HotelbedsDebugSource['contentSource'] = 'NONE';
    if (content) {
      contentSource = cacheHit ? 'CACHE' : 'CONTENT_API';
    } else if (cacheHit) {
      contentSource = 'CACHE';
    }
    return {
      contentSource,
      imageSource,
      contentApiStatus: diagnostics.lastContentRequest?.status ?? null,
      contentFetchedAt: meta?.fetchedAt ?? null,
      cacheHit,
      dbHit: false,
      fallbackUsed: false,
    };
  }

  async buildDebugSourceAsync(code: number, content?: HbContentHotel): Promise<HotelbedsDebugSource> {
    const base = this.buildDebugSource(code, content);
    const dbImages = await this.contentStorage.countImages(code);
    const hasImages = sortHotelbedsImages(content?.images).length > 0;
    if (dbImages > 0) {
      return {
        ...base,
        dbHit: true,
        contentSource: 'DATABASE',
        imageSource: hasImages
          ? base.cacheHit
            ? 'HOTELBEDS_CACHE'
            : 'DATABASE_CACHE'
          : dbImages > 0
            ? 'DATABASE_CACHE'
            : 'NONE',
      };
    }
    return base;
  }

  private toPublicItem(item: NormalizedAccommodation): NormalizedAccommodation {
    const { debugSource: _debugSource, ...rest } = item;
    return rest;
  }

  private toPublicResponse<T extends { items?: NormalizedAccommodation[] } | NormalizedAccommodation>(
    data: T,
  ): T {
    if (Array.isArray((data as { items?: NormalizedAccommodation[] }).items)) {
      const response = data as HotelbedsSearchResponse;
      return { ...response, items: response.items.map((i) => this.toPublicItem(i)) } as unknown as T;
    }
    return this.toPublicItem(data as NormalizedAccommodation) as T;
  }

  private async fetchAvailabilityForHotel(
    code: number,
    checkIn: string,
    checkOut: string,
    adults: number,
    rooms: number,
  ): Promise<HbBookingHotel | undefined> {
    const cacheKey = `avail:${code}:${checkIn}:${checkOut}:${adults}:${rooms}`;
    const cached = this.cache.get<HbBookingHotel>(cacheKey);
    if (cached) return cached;

    const url = `${this.config.bookingBaseUrl}/hotels`;
    const body = {
      stay: { checkIn, checkOut },
      occupancies: [{ rooms, adults, children: 0 }],
      hotels: { hotel: [code] },
    };
    const { data } = await this.http.postJson<BookingSearchPayload>(url, body, 'booking/hotel-detail');
    const hotel = data.hotels?.hotels?.[0];
    if (hotel) this.cache.set(cacheKey, hotel, CACHE_AVAIL_MS);
    return hotel;
  }

  private async mergeHotel(
    booking: HbBookingHotel,
    content: HbContentHotel | undefined,
    checkIn: string,
    checkOut: string,
    opts?: { catalogOnly?: boolean },
  ): Promise<NormalizedAccommodation | null> {
    const code = booking.code ?? content?.code;
    if (code == null) return null;

    const name = localizedText(content?.name) ?? booking.name ?? `Hotel ${code}`;
    const description = localizedText(content?.description);
    const shortDescription = description ? description.slice(0, 220) : null;
    const city =
      localizedText(content?.city) ??
      booking.destinationName ??
      booking.zoneName ??
      'Česko';
    const addressParts = [content?.address?.street, content?.address?.number].filter(Boolean);
    const address = addressParts.length ? addressParts.join(' ') : null;
    const lat = Number(content?.coordinates?.latitude ?? booking.latitude);
    const lng = Number(content?.coordinates?.longitude ?? booking.longitude);
    const stars = starsFromCategory(content?.categoryCode ?? booking.categoryCode);
    const sortedImages = sortHotelbedsImages(content?.images);
    const photos = sortedImages
      .map((img, idx) => ({
        url: this.imageService.buildProxyUrl(code, idx, idx === 0 ? 'hero' : 'detail'),
        alt: name,
      }))
      .filter((p) => p.url);
    const cardPhoto = sortedImages[0]?.path
      ? this.imageService.buildProxyUrl(code, 0, 'card')
      : null;

    const facilities = (content?.facilities ?? [])
      .map((f) => localizedText(f.description))
      .filter((x): x is string => Boolean(x))
      .slice(0, 20);

    const flags = facilityFlags(facilities);
    const boardTypes = new Set<string>();
    const rooms: NormalizedAccommodation['rooms'] = [];

    for (const room of booking.rooms ?? []) {
      for (const rate of room.rates ?? []) {
        if (rate.boardName) boardTypes.add(rate.boardName);
        const net = rate.net != null ? Number(rate.net) : null;
        const converted = this.currency.toDisplayCzk(net, booking.currency ?? 'EUR');
        rooms.push({
          code: room.code ?? `${code}-room`,
          name: room.name ?? 'Pokoj',
          description: null,
          capacity: (rate.adults ?? 2) + (rate.children ?? 0),
          priceFrom: converted.amount,
          currency: converted.currency,
          boardType: rate.boardName ?? null,
          available: true,
        });
      }
    }

    const minRate = booking.minRate != null ? Number(booking.minRate) : rooms[0]?.priceFrom ?? null;
    const convertedPrice = this.currency.toDisplayCzk(minRate, booking.currency ?? 'EUR');
    const hasVerifiedAvailability = !opts?.catalogOnly && (rooms.length > 0 || minRate != null);
    const cancellationPolicy = cancellationSummary(
      booking.rooms?.flatMap((r) => r.rates?.flatMap((rt) => rt.cancellationPolicies ?? []) ?? []) ?? [],
    );

    const slug = hotelSlug(code, name);
    const coverPhoto = cardPhoto ?? photos[0]?.url ?? null;
    const debugSource = await this.buildDebugSourceAsync(code, content);
    const xxrealitCategory = mapHotelbedsToCategory({
      accommodationTypeCode: content?.accommodationTypeCode,
      categoryName: booking.categoryName ?? content?.category?.description?.content,
      categoryCode: content?.categoryCode ?? booking.categoryCode,
      name,
    });

    return {
      id: `hb-${code}`,
      provider: 'HOTELBEDS',
      providerId: String(code),
      name,
      slug,
      description,
      shortDescription,
      category: booking.categoryName ?? content?.category?.description?.content ?? null,
      type: 'HOTEL',
      stars,
      rating: null,
      reviewCount: 0,
      address,
      city,
      region: booking.zoneName ?? null,
      country: content?.countryCode ?? 'CZ',
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      photos,
      facilities,
      rooms,
      boardTypes: [...boardTypes],
      priceFrom: hasVerifiedAvailability ? convertedPrice.amount : null,
      priceFromOriginal: hasVerifiedAvailability ? convertedPrice.originalAmount : null,
      currency: convertedPrice.currency,
      originalCurrency: convertedPrice.originalCurrency,
      priceUnit: 'PER_NIGHT',
      available: hasVerifiedAvailability,
      catalogOnly: Boolean(opts?.catalogOnly),
      availabilityStatus: hasVerifiedAvailability ? 'verified' : 'unknown',
      cancellationPolicy,
      checkIn,
      checkOut,
      checkInFrom: '15:00',
      checkOutUntil: '11:00',
      sourceEnvironment: 'TEST',
      amenities: facilities.slice(0, 6),
      tags: stars ? [`${stars}★`] : [],
      wifi: flags.wifi,
      parking: flags.parking,
      breakfast: flags.breakfast || boardTypes.size > 0,
      wellness: flags.wellness,
      pool: flags.pool,
      petsAllowed: flags.pets,
      accessible: flags.accessible,
      xxrealitCategory,
      contentEnriched: Boolean(content),
      debugSource,
      seoTitle: `${name} | Ubytování ${city} | XXREALIT`,
      seoDescription: shortDescription,
      coverPhoto,
    };
  }

  private mapPublicError(status: number, errorBody?: string): string {
    if (status === 403 || status === 401) {
      const hint = errorBody?.match(/Message:\s*(.+)/i)?.[1]?.trim();
      if (hint) {
        return `Ubytování se momentálně nepodařilo načíst (${hint}).`;
      }
    }
    switch (status) {
      case 401:
      case 403:
        return 'Ubytování se momentálně nepodařilo načíst. Zkuste to prosím za chvíli.';
      case 429:
        return 'Ubytování se momentálně nepodařilo načíst. Zkuste to prosím za chvíli.';
      default:
        return 'Ubytování se momentálně nepodařilo načíst. Zkuste to prosím za chvíli.';
    }
  }
}
