import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService } from './meta-graph-client.service';

export type MetaGeoLocationItem = {
  city: string;
  metaKey: string;
  country: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  fromCache: boolean;
};

export type MetaGeoResolvedTargeting =
  | { mode: 'city'; key: number }
  | { mode: 'custom'; latitude: number; longitude: number; radiusKm: number };

export type MetaLocationTargetingMode = 'city' | 'radius';

type MetaSearchRow = {
  key?: string | number;
  name?: string;
  country_code?: string;
  country_name?: string;
  region?: string;
  region_id?: number;
  latitude?: number;
  longitude?: number;
  type?: string;
};

@Injectable()
export class MetaCenterGeoService {
  private readonly logger = new Logger(MetaCenterGeoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
  ) {}

  async searchCities(
    query: string,
    countryCode = 'CZ',
  ): Promise<{ ok: true; items: MetaGeoLocationItem[]; fromCache: boolean; message?: string } | { ok: false; items: MetaGeoLocationItem[]; message: string }> {
    const q = query.trim();
    if (q.length < 2) {
      return { ok: true, items: [], fromCache: true, message: 'Zadejte alespoň 2 znaky.' };
    }

    const cached = await this.prisma.metaGeoLocation.findMany({
      where: { city: { startsWith: q, mode: 'insensitive' } },
      orderBy: { city: 'asc' },
      take: 25,
    });

    if (cached.length > 0) {
      return {
        ok: true,
        items: cached.map((row) => this.serializeRow(row, true)),
        fromCache: true,
      };
    }

    let token: string;
    try {
      token = await this.oauth.resolveMarketingAccessToken();
    } catch (err) {
      return {
        ok: false,
        items: [],
        message: err instanceof Error ? err.message : 'Marketing token chybí.',
      };
    }

    const res = await this.graph.get<{ data?: MetaSearchRow[] }>('/search', token, {
      type: 'adgeolocation',
      q,
      location_types: '["city"]',
      country_code: countryCode,
    });

    if (!res.ok) {
      return { ok: false, items: [], message: res.errorMessage };
    }

    const parsed = (res.data.data ?? [])
      .map((row) => this.parseSearchRow(row))
      .filter((item): item is MetaGeoLocationItem => item != null);

    for (const item of parsed) {
      await this.upsertCache(item);
    }

    return { ok: true, items: parsed.map((item) => ({ ...item, fromCache: false })), fromCache: false };
  }

  async resolveGeoForTargeting(input: {
    metaGeoKey?: string | null;
    cityName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    radiusKm: number;
    locationTargetingMode?: MetaLocationTargetingMode | string | null;
  }): Promise<MetaGeoResolvedTargeting> {
    const radiusKm = input.radiusKm > 0 ? input.radiusKm : 15;
    const locationMode: MetaLocationTargetingMode =
      input.locationTargetingMode === 'radius' ? 'radius' : 'city';

    if (locationMode === 'radius') {
      let latitude = input.latitude;
      let longitude = input.longitude;

      if (
        (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) &&
        input.cityName?.trim()
      ) {
        const cached = await this.findCachedCity(input.cityName.trim());
        if (cached?.lat != null && cached.lng != null) {
          latitude = cached.lat;
          longitude = cached.lng;
        }
      }

      if (
        latitude != null &&
        longitude != null &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
      ) {
        return {
          mode: 'custom',
          latitude,
          longitude,
          radiusKm,
        };
      }

      throw new Error(
        'Pro okruh podle souřadnic zadejte latitude a longitude, nebo vyberte město s uloženými souřadnicemi.',
      );
    }

    const explicitKey = this.parseMetaGeoKey(input.metaGeoKey);
    if (explicitKey != null) {
      return { mode: 'city', key: explicitKey };
    }

    if (input.cityName?.trim()) {
      const cached = await this.findCachedCity(input.cityName.trim());
      if (cached) {
        const key = this.parseMetaGeoKey(cached.metaKey);
        if (key != null) {
          return { mode: 'city', key };
        }
      }

      const searched = await this.searchCities(input.cityName.trim());
      if (searched.ok && searched.items.length > 0) {
        const exact =
          searched.items.find(
            (item) => item.city.localeCompare(input.cityName!.trim(), 'cs', { sensitivity: 'base' }) === 0,
          ) ?? searched.items[0];
        const key = this.parseMetaGeoKey(exact.metaKey);
        if (key != null) {
          return { mode: 'city', key };
        }
      }
    }

    if (
      input.latitude != null &&
      input.longitude != null &&
      Number.isFinite(input.latitude) &&
      Number.isFinite(input.longitude)
    ) {
      return {
        mode: 'custom',
        latitude: input.latitude,
        longitude: input.longitude,
        radiusKm,
      };
    }

    throw new Error(
      'Lokalitu nelze namapovat. Vyberte město z návrhů Meta (Geo ID) nebo zadejte souřadnice pro okruh.',
    );
  }

  private parseMetaGeoKey(value: string | number | null | undefined): number | null {
    if (value == null || value === '') return null;
    const key = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);
    if (!Number.isInteger(key) || key <= 0) return null;
    return key;
  }

  private async findCachedCity(city: string) {
    return this.prisma.metaGeoLocation.findFirst({
      where: { city: { equals: city, mode: 'insensitive' } },
    });
  }

  private parseSearchRow(row: MetaSearchRow): MetaGeoLocationItem | null {
    const metaKey = row.key != null ? String(row.key).trim() : '';
    const city = row.name?.trim() ?? '';
    if (!metaKey || !city) return null;
    if (!/^\d+$/.test(metaKey)) return null;

    return {
      city,
      metaKey,
      country: row.country_code?.trim() ?? row.country_name?.trim() ?? null,
      region: row.region?.trim() ?? null,
      lat: typeof row.latitude === 'number' && Number.isFinite(row.latitude) ? row.latitude : null,
      lng: typeof row.longitude === 'number' && Number.isFinite(row.longitude) ? row.longitude : null,
      fromCache: false,
    };
  }

  private serializeRow(
    row: {
      city: string;
      metaKey: string;
      country: string | null;
      region: string | null;
      lat: number | null;
      lng: number | null;
    },
    fromCache: boolean,
  ): MetaGeoLocationItem {
    return {
      city: row.city,
      metaKey: row.metaKey,
      country: row.country,
      region: row.region,
      lat: row.lat,
      lng: row.lng,
      fromCache,
    };
  }

  private async upsertCache(item: MetaGeoLocationItem): Promise<void> {
    try {
      await this.prisma.metaGeoLocation.upsert({
        where: { metaKey: item.metaKey },
        create: {
          city: item.city,
          metaKey: item.metaKey,
          country: item.country,
          region: item.region,
          lat: item.lat,
          lng: item.lng,
        },
        update: {
          city: item.city,
          country: item.country,
          region: item.region,
          lat: item.lat,
          lng: item.lng,
        },
      });
    } catch (err) {
      this.logger.warn(
        `MetaGeoLocation cache upsert failed (${item.metaKey}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
