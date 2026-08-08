import { Injectable } from '@nestjs/common';
import type { AccommodationProviderInterface } from './accommodation-provider.interface';
import { BookingAccommodationProvider } from './booking/booking-accommodation.provider';
import { DemoAccommodationProvider } from './demo/demo-accommodation.provider';

@Injectable()
export class AccommodationProviderRegistry {
  private readonly map: Map<string, AccommodationProviderInterface>;

  constructor(
    demo: DemoAccommodationProvider,
    booking: BookingAccommodationProvider,
  ) {
    const providers: AccommodationProviderInterface[] = [demo, booking];
    this.map = new Map(providers.map((p) => [p.id, p]));
  }

  get(id: string): AccommodationProviderInterface | undefined {
    return this.map.get(id);
  }

  list(): AccommodationProviderInterface[] {
    return [...this.map.values()];
  }

  default(): AccommodationProviderInterface {
    return this.map.get('demo')!;
  }
}
