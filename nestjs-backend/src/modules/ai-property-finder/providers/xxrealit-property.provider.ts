import { Injectable } from '@nestjs/common';
import { PropertiesService } from '../../properties/properties.service';
import type { PropertyDiscoveryProvider, PropertyDiscoverySearchInput } from './property-discovery.provider';
import type { PropertySearchResult } from '../ai-property-finder.types';

@Injectable()
export class XxRealitPropertyProvider implements PropertyDiscoveryProvider {
  readonly name = 'XXREALIT';
  readonly sourceType = 'XXREALIT' as const;

  constructor(private readonly properties: PropertiesService) {}

  isConfigured(): boolean {
    return true;
  }

  async search(input: PropertyDiscoverySearchInput): Promise<Omit<PropertySearchResult, 'matchScore' | 'matchReasons'>[]> {
    const c = input.criteria;
    const limit = Math.min(40, Math.max(5, input.limit ?? 24));
    const { items } = await this.properties.findAllPublic(undefined, {
      location: c.location,
      city: c.location,
      propertyTypeKey: c.propertyTypeKey,
      priceMin: c.priceMin,
      priceMax: c.priceMax,
    });

    const now = new Date().toISOString();
    return items.slice(0, limit).map((row) => {
      const rec = row as Record<string, unknown>;
      const slug = (rec.slug as string | null) ?? null;
      const id = String(rec.id);
      const path = slug ? `/nemovitosti/${slug}` : `/nemovitost/${id}`;
      const price = (rec.price as number | null) ?? null;
      const imageUrl =
        (rec.mainImage as string | null) ??
        (rec.coverImage as string | null) ??
        (Array.isArray(rec.images) ? (rec.images[0] as string) : null) ??
        null;
      return {
        id: `xxr:${id}`,
        source: 'XXREALIT',
        sourceType: 'XXREALIT' as PropertySearchResult['sourceType'],
        sourceUrl: path,
        canonicalUrl: path,
        title: String(rec.title ?? 'Nemovitost'),
        propertyType: String(rec.propertyType ?? c.propertyType ?? ''),
        transactionType: c.transaction,
        price,
        currency: 'CZK',
        location: String(rec.city ?? c.location ?? ''),
        area: (rec.area as number | null) ?? (rec.usableArea as number | null) ?? null,
        disposition: (rec.layout as string | null) ?? (rec.disposition as string | null) ?? null,
        descriptionSnippet: String(rec.perex ?? rec.description ?? '').slice(0, 240) || undefined,
        imageUrl,
        imageUsageAllowed: Boolean(imageUrl),
        contactDisplayAllowed: false,
        discoveredAt: now,
        isInternal: true,
        isExternal: false,
      };
    });
  }
}
