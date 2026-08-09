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
  HOTELBEDS_CONTENT_LANGUAGE,
  HOTELBEDS_CONTENT_SECONDARY_LANGUAGE,
  HOTELBEDS_PAGE_SIZE,
  cancellationSummary,
  facilityFlags,
  hotelSlug,
  hotelbedsImageUrl,
  localizedText,
  parseHotelCodeFromSlug,
  starsFromCategory,
  type HbBookingHotel,
  type HbContentHotel,
} from './hotelbeds-normalizer';
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

type ContentHotelsPayload = {
  hotels?: HbContentHotel[];
};

@Injectable()
export class HotelbedsPublicService {
  private readonly log = new Logger(HotelbedsPublicService.name);

  constructor(
    private readonly config: HotelbedsConfigService,
    private readonly http: HotelbedsHttpService,
    private readonly currency: HotelbedsCurrencyService,
    private readonly cache: HotelbedsCacheService,
    private readonly metrics: HotelbedsMetricsService,
  ) {}

  getPublicConfig(): HotelbedsPublicConfig {
    return {
      publicListings: this.config.publicListings,
      bookingEnabled: this.config.bookingEnabled,
      environment: this.config.environment,
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

    const cacheKey = `search:${destination.label}:${checkIn}:${checkOut}:${adults}:${rooms}:${query.category ?? ''}:${query.starsMin ?? ''}:${query.priceMax ?? ''}:${query.wifi ? 1 : 0}:${query.parking ? 1 : 0}:${query.breakfast ? 1 : 0}:${query.wellness ? 1 : 0}:${query.pool ? 1 : 0}:${query.pets ? 1 : 0}:${query.accessible ? 1 : 0}:${page}:${limit}`;
    const cached = this.cache.get<HotelbedsSearchResponse>(cacheKey);
    if (cached) return cached;

    try {
      const allItems = await this.loadSearchBatch(destination, checkIn, checkOut, adults, rooms, query);
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
      return response;
    } catch (err) {
      this.log.warn(`Hotelbeds search failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof HotelbedsHttpError) {
        throw new ServiceUnavailableException(this.mapPublicError(err.status));
      }
      throw new ServiceUnavailableException('Ubytování se momentálně nepodařilo načíst. Zkuste to prosím za chvíli.');
    }
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
    const contentMap = await this.fetchContentByCodes(codes);

    const merged = bookingHotels
      .map((bh) => this.mergeHotel(bh, contentMap.get(String(bh.code)), checkIn, checkOut))
      .filter((h): h is NormalizedAccommodation => h != null);

    this.cache.set(batchKey, merged, CACHE_SEARCH_MS);
    return merged;
  }

  private applySearchFilters(items: NormalizedAccommodation[], query: HotelbedsSearchQuery) {
    return items.filter((h) => {
      if (query.category && !categoryMatchesFilter(h.xxrealitCategory as never, query.category)) return false;
      if (query.starsMin && (h.stars ?? 0) < query.starsMin) return false;
      if (query.priceMax && (h.priceFrom ?? Infinity) > query.priceMax) return false;
      if (query.wifi && !h.wifi) return false;
      if (query.parking && !h.parking) return false;
      if (query.breakfast && !h.breakfast) return false;
      if (query.wellness && !h.wellness) return false;
      if (query.pool && !h.pool) return false;
      if (query.pets && !h.petsAllowed) return false;
      if (query.accessible && !h.accessible) return false;
      if (query.ratingMin && (h.rating ?? 0) < query.ratingMin) return false;
      return true;
    });
  }

  async getBySlug(slug: string, query?: Partial<HotelbedsSearchQuery>): Promise<NormalizedAccommodation> {
    const code = parseHotelCodeFromSlug(slug);
    if (!code) throw new NotFoundException('Hotel nenalezen.');

    const defaults = defaultSearchDates();
    const checkIn = query?.checkIn || defaults.checkIn;
    const checkOut = query?.checkOut || defaults.checkOut;
    const cacheKey = `detail:${code}:${checkIn}:${checkOut}:${query?.adults ?? 2}:${query?.rooms ?? 1}`;
    const cached = this.cache.get<NormalizedAccommodation>(cacheKey);
    if (cached) return cached;

    const contentMap = await this.fetchContentByCodes([Number(code)]);
    const content = contentMap.get(code);

    let bookingHotel: HbBookingHotel | undefined;
    try {
      const availability = await this.fetchAvailabilityForHotel(
        Number(code),
        checkIn,
        checkOut,
        query?.adults ?? 2,
        query?.rooms ?? 1,
      );
      bookingHotel = availability;
    } catch {
      bookingHotel = undefined;
    }

    const merged = this.mergeHotel(
      bookingHotel ?? { code: Number(code), name: localizedText(content?.name) ?? undefined },
      content,
      checkIn,
      checkOut,
    );
    if (!merged) throw new NotFoundException('Hotel nenalezen.');

    this.cache.set(cacheKey, merged, CACHE_DETAIL_MS);
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
    });
    return search.items.filter((h) => h.slug !== slug).slice(0, 6);
  }

  private async fetchContentByCodes(codes: number[]): Promise<Map<string, HbContentHotel>> {
    const map = new Map<string, HbContentHotel>();
    if (!codes.length) return map;

    const unique = [...new Set(codes)].filter((c) => Number.isFinite(c));
    const missing: number[] = [];
    for (const code of unique) {
      const cached = this.cache.get<HbContentHotel>(`content:${code}`);
      if (cached) map.set(String(code), cached);
      else missing.push(code);
    }
    if (!missing.length) return map;

    const url =
      `${this.config.contentBaseUrl}/hotels` +
      `?language=${HOTELBEDS_CONTENT_LANGUAGE}&useSecondaryLanguage=true&secondaryLanguage=${HOTELBEDS_CONTENT_SECONDARY_LANGUAGE}&fields=all&codes=${missing.join(',')}`;

    try {
      const data = await this.http.getJson<ContentHotelsPayload>(url, {
        cacheKey: `content-batch:${missing.sort().join(',')}`,
        cacheTtlMs: CACHE_CONTENT_MS,
        label: 'content/hotels',
      });
      const hotels = data.hotels ?? [];
      this.metrics.recordContentSync(hotels.length);
      for (const hotel of hotels) {
        if (hotel.code == null) continue;
        this.cache.set(`content:${hotel.code}`, hotel, CACHE_CONTENT_MS);
        map.set(String(hotel.code), hotel);
      }
    } catch (err) {
      this.log.warn(`Content fetch failed for ${missing.length} hotels`);
    }
    return map;
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

  private mergeHotel(
    booking: HbBookingHotel,
    content: HbContentHotel | undefined,
    checkIn: string,
    checkOut: string,
  ): NormalizedAccommodation | null {
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
    const photos = (content?.images ?? [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((img) => ({
        url: hotelbedsImageUrl(img.path) ?? '',
        alt: name,
      }))
      .filter((p) => p.url);

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
    const cancellationPolicy = cancellationSummary(
      booking.rooms?.flatMap((r) => r.rates?.flatMap((rt) => rt.cancellationPolicies ?? []) ?? []) ?? [],
    );

    const slug = hotelSlug(code, name);
    const coverPhoto = photos[0]?.url ?? null;
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
      priceFrom: convertedPrice.amount,
      priceFromOriginal: convertedPrice.originalAmount,
      currency: convertedPrice.currency,
      originalCurrency: convertedPrice.originalCurrency,
      priceUnit: 'PER_NIGHT',
      available: rooms.length > 0 || minRate != null,
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
      seoTitle: `${name} | Ubytování ${city} | XXREALIT`,
      seoDescription: shortDescription,
      coverPhoto,
    };
  }

  private mapPublicError(status: number): string {
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
