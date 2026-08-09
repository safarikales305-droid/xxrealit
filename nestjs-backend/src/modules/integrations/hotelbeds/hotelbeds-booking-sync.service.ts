import { Injectable, Logger } from '@nestjs/common';
import { defaultSearchDates, resolveDestination } from './hotelbeds-destinations';
import { HotelbedsHttpError, HotelbedsHttpService } from './hotelbeds-http.service';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsContentStorageService } from './hotelbeds-content-storage.service';
import { HOTELBEDS_BATCH_MAX, type HbBookingHotel } from './hotelbeds-normalizer';

type BookingSearchPayload = {
  hotels?: { hotels?: HbBookingHotel[]; total?: number };
  error?: { code?: string; message?: string };
};

export type HotelbedsBookingSyncResult = {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  destination: string;
  dbHotelbedsBefore: number;
  dbHotelbedsAfter: number;
  bookingHotelsReturned: number;
  loaded: number;
  created: number;
  updated: number;
  errors: string[];
  contentApiCalled: boolean;
  message: string;
};

@Injectable()
export class HotelbedsBookingSyncService {
  private readonly log = new Logger(HotelbedsBookingSyncService.name);

  constructor(
    private readonly config: HotelbedsConfigService,
    private readonly http: HotelbedsHttpService,
    private readonly storage: HotelbedsContentStorageService,
    private readonly metrics: HotelbedsMetricsService,
  ) {}

  async syncOffersFromBookingApi(
    destination = 'Praha',
    maxHotels = 30,
  ): Promise<HotelbedsBookingSyncResult> {
    const dest = resolveDestination(destination);
    const dbHotelbedsBefore = await this.storage.countCatalog();

    if (!this.http.getCredentials()) {
      return {
        success: false,
        destination: dest.label,
        dbHotelbedsBefore,
        dbHotelbedsAfter: dbHotelbedsBefore,
        bookingHotelsReturned: 0,
        loaded: 0,
        created: 0,
        updated: 0,
        errors: ['Chybí HOTELBEDS_API_KEY nebo HOTELBEDS_API_SECRET.'],
        contentApiCalled: false,
        message: 'Booking API není nakonfigurováno.',
      };
    }

    const dates = defaultSearchDates();
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
      filter: { maxHotels: Math.min(maxHotels, HOTELBEDS_BATCH_MAX) },
    };

    let bookingHotels: HbBookingHotel[] = [];
    try {
      const { data } = await this.http.postJson<BookingSearchPayload>(url, body, 'booking/catalog-sync');
      bookingHotels = data.hotels?.hotels ?? [];
      if (!bookingHotels.length) {
        const dbHotelbedsAfter = await this.storage.countCatalog();
        return {
          success: true,
          httpStatus: 200,
          destination: dest.label,
          dbHotelbedsBefore,
          dbHotelbedsAfter,
          bookingHotelsReturned: 0,
          loaded: 0,
          created: 0,
          updated: 0,
          errors: [],
          contentApiCalled: false,
          message: 'Booking API vrátilo 0 hotelů pro zadanou destinaci a termín.',
        };
      }
    } catch (err) {
      const status = err instanceof HotelbedsHttpError ? err.status : 0;
      const errorBody = err instanceof HotelbedsHttpError ? err.errorBody : undefined;
      const dbHotelbedsAfter = await this.storage.countCatalog();
      return {
        success: false,
        httpStatus: status || undefined,
        errorCode: String(status || 'NETWORK_ERROR'),
        errorMessage: errorBody ?? (err instanceof Error ? err.message : String(err)),
        destination: dest.label,
        dbHotelbedsBefore,
        dbHotelbedsAfter,
        bookingHotelsReturned: 0,
        loaded: 0,
        created: 0,
        updated: 0,
        errors: [errorBody ?? (err instanceof Error ? err.message : String(err))],
        contentApiCalled: false,
        message: 'Synchronizace z Booking API selhala.',
      };
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const hotel of bookingHotels) {
      if (hotel.code == null) continue;
      try {
        const result = await this.storage.upsertFromBooking(hotel, dest.label, {
          checkIn: dates.checkIn,
          checkOut: dates.checkOut,
        });
        if (result.created) created++;
        else updated++;
      } catch (err) {
        errors.push(
          `#${hotel.code}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const loaded = created + updated;
    const dbHotelbedsAfter = await this.storage.countCatalog();
    this.metrics.recordSearch(dest.label, dbHotelbedsAfter);

    this.log.log(
      `Booking catalog sync ${dest.label}: returned=${bookingHotels.length} loaded=${loaded} created=${created} updated=${updated} db=${dbHotelbedsAfter}`,
    );

    return {
      success: true,
      httpStatus: 200,
      destination: dest.label,
      dbHotelbedsBefore,
      dbHotelbedsAfter,
      bookingHotelsReturned: bookingHotels.length,
      loaded,
      created,
      updated,
      errors: errors.slice(0, 20),
      contentApiCalled: false,
      message: `Načteno ${loaded} hotelů z Booking API (${created} nových, ${updated} aktualizovaných).`,
    };
  }
}
