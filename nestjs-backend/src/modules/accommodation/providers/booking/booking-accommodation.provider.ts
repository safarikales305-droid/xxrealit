import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AccommodationAvailabilityResult,
  AccommodationProviderInterface,
  AccommodationProviderItem,
  AccommodationSearchParams,
  AccommodationSyncBatchResult,
} from '../accommodation-provider.interface';

/**
 * Skeleton pro budoucí Booking.com Demand API.
 * Bez credentials vrací prázdná data — UI nesmí padat.
 */
@Injectable()
export class BookingAccommodationProvider implements AccommodationProviderInterface {
  private readonly log = new Logger(BookingAccommodationProvider.name);
  readonly id = 'booking';
  readonly label = 'Booking.com';

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>('BOOKING_API_KEY')?.trim() || undefined;
  }

  private get affiliateId(): string | undefined {
    return this.config.get<string>('BOOKING_AFFILIATE_ID')?.trim() || undefined;
  }

  async isConfigured(): Promise<boolean> {
    return Boolean(this.apiKey && this.affiliateId);
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!(await this.isConfigured())) {
      return { ok: false, message: 'Chybí BOOKING_API_KEY nebo BOOKING_AFFILIATE_ID.' };
    }
    return { ok: false, message: 'Booking.com Demand API zatím není implementováno — připraven skeleton.' };
  }

  async search(_params: AccommodationSearchParams): Promise<AccommodationProviderItem[]> {
    if (!(await this.isConfigured())) return [];
    this.log.debug('Booking search skipped — API not implemented');
    return [];
  }

  async getDetails(_externalId: string): Promise<AccommodationProviderItem | null> {
    return null;
  }

  async getAvailability(
    _externalId: string,
    _checkIn: string,
    _checkOut: string,
  ): Promise<AccommodationAvailabilityResult> {
    return { available: false };
  }

  async getPrices(): Promise<{ priceFrom: number; currency: string } | null> {
    return null;
  }

  async fetchBatch(_cursor?: string, _limit = 100): Promise<AccommodationSyncBatchResult> {
    return { items: [], hasMore: false };
  }
}
