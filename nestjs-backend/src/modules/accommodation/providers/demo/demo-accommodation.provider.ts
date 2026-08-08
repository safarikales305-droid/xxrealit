import { Injectable } from '@nestjs/common';
import { DEMO_ACCOMMODATIONS } from '../../seed/demo-accommodations.data';
import type {
  AccommodationAvailabilityResult,
  AccommodationProviderInterface,
  AccommodationProviderItem,
  AccommodationSearchParams,
  AccommodationSyncBatchResult,
} from '../accommodation-provider.interface';

@Injectable()
export class DemoAccommodationProvider implements AccommodationProviderInterface {
  readonly id = 'demo';
  readonly label = 'Demo / lokální data';

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Demo provider je vždy dostupný.' };
  }

  async search(params: AccommodationSearchParams): Promise<AccommodationProviderItem[]> {
    let rows = [...DEMO_ACCOMMODATIONS];
    const q = params.query?.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q) ||
          r.region?.toLowerCase().includes(q),
      );
    }
    if (params.city) {
      const city = params.city.toLowerCase();
      rows = rows.filter((r) => r.city.toLowerCase().includes(city));
    }
    if (params.type) {
      rows = rows.filter((r) => r.type === params.type);
    }
    if (params.category) {
      const cat = params.category;
      rows = rows.filter((r) => r.tags?.includes(cat) || r.type === cat);
    }
    if (params.priceMin != null) rows = rows.filter((r) => (r.priceFrom ?? 0) >= params.priceMin!);
    if (params.priceMax != null) rows = rows.filter((r) => (r.priceFrom ?? 0) <= params.priceMax!);
    if (params.ratingMin != null) rows = rows.filter((r) => (r.rating ?? 0) >= params.ratingMin!);
    if (params.wifi) rows = rows.filter((r) => r.amenities?.includes('Wi-Fi'));
    if (params.parking) rows = rows.filter((r) => r.amenities?.includes('Parkování'));
    if (params.breakfast) rows = rows.filter((r) => r.amenities?.includes('Snídaně'));
    if (params.wellness) rows = rows.filter((r) => r.amenities?.includes('Wellness'));
    if (params.pool) rows = rows.filter((r) => r.amenities?.includes('Bazén'));
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const start = (page - 1) * limit;
    return rows.slice(start, start + limit);
  }

  async getDetails(externalId: string): Promise<AccommodationProviderItem | null> {
    return DEMO_ACCOMMODATIONS.find((r) => r.externalId === externalId) ?? null;
  }

  async getAvailability(
    _externalId: string,
    _checkIn: string,
    _checkOut: string,
  ): Promise<AccommodationAvailabilityResult> {
    return { available: true, priceFrom: undefined, currency: 'CZK', roomsLeft: 3 };
  }

  async getPrices(
    externalId: string,
    _checkIn: string,
    _checkOut: string,
  ): Promise<{ priceFrom: number; currency: string } | null> {
    const item = DEMO_ACCOMMODATIONS.find((r) => r.externalId === externalId);
    if (!item?.priceFrom) return null;
    return { priceFrom: item.priceFrom, currency: item.currency ?? 'CZK' };
  }

  async fetchBatch(cursor?: string, limit = 100): Promise<AccommodationSyncBatchResult> {
    const offset = cursor ? Number(cursor) : 0;
    const items = DEMO_ACCOMMODATIONS.slice(offset, offset + limit);
    const next = offset + items.length;
    return {
      items,
      nextCursor: next < DEMO_ACCOMMODATIONS.length ? String(next) : undefined,
      hasMore: next < DEMO_ACCOMMODATIONS.length,
    };
  }
}
