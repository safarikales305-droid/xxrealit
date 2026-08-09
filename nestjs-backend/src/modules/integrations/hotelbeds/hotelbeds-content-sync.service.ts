import { Injectable, Logger } from '@nestjs/common';
import { defaultSearchDates, resolveDestination } from './hotelbeds-destinations';
import { HotelbedsHttpService } from './hotelbeds-http.service';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import { HotelbedsPublicService } from './hotelbeds-public.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsContentStorageService } from './hotelbeds-content-storage.service';
import { HOTELBEDS_BATCH_MAX } from './hotelbeds-normalizer';

type BookingSearchPayload = {
  hotels?: { hotels?: Array<{ code?: number }>; total?: number };
};

@Injectable()
export class HotelbedsContentSyncService {
  private readonly log = new Logger(HotelbedsContentSyncService.name);

  constructor(
    private readonly config: HotelbedsConfigService,
    private readonly http: HotelbedsHttpService,
    private readonly publicService: HotelbedsPublicService,
    private readonly storage: HotelbedsContentStorageService,
    private readonly metrics: HotelbedsMetricsService,
  ) {}

  async syncHotel(hotelCode: number) {
    const contentMap = await this.publicService.getHotelContents([hotelCode], {
      force: true,
      skipCache: true,
    });
    const hotel = contentMap.get(String(hotelCode));
    if (!hotel) {
      return {
        success: false,
        hotelCode,
        message: 'Hotel nebyl nalezen v Content API response.',
      };
    }
    await this.storage.upsertFromContent(hotel);
    const imagesInDb = await this.storage.countImages(hotelCode);
    return {
      success: true,
      hotelCode,
      name: typeof hotel.name === 'string' ? hotel.name : hotel.name?.content ?? null,
      imagesInDb,
      imagesFromApi: hotel.images?.length ?? 0,
    };
  }

  async syncFromBookingSearch(destination = 'Praha', maxHotels = HOTELBEDS_BATCH_MAX) {
    const dates = defaultSearchDates();
    const dest = resolveDestination(destination);
    const url = `${this.config.bookingBaseUrl}/hotels`;
    const body = {
      stay: { checkIn: dates.checkIn, checkOut: dates.checkOut },
      occupancies: [{ rooms: 1, adults: 2, children: 0 }],
      geolocation: {
        latitude: dest.latitude,
        longitude: dest.longitude,
        radius: dest.radiusKm,
        unit: 'km',
      },
      filter: { maxHotels },
    };

    const { data } = await this.http.postJson<BookingSearchPayload>(url, body, 'booking/search');
    const codes = (data.hotels?.hotels ?? [])
      .map((h) => h.code)
      .filter((c): c is number => c != null);

    let synced = 0;
    let withImages = 0;
    const errors: string[] = [];

    for (const code of codes) {
      try {
        const result = await this.syncHotel(code);
        if (result.success) {
          synced++;
          if ((result.imagesInDb ?? 0) > 0) withImages++;
        } else {
          errors.push(`#${code}: ${result.message}`);
        }
      } catch (err) {
        errors.push(`#${code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.metrics.recordContentSync(synced, withImages);
    this.log.log(`Hotelbeds content sync: ${synced}/${codes.length} hotels, ${withImages} with images`);

    return {
      success: true,
      destination: dest.label,
      requested: codes.length,
      synced,
      withImages,
      errors: errors.slice(0, 20),
    };
  }
}
