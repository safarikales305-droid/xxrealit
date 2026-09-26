import { Injectable, Logger } from '@nestjs/common';
import { WebSearchProvider } from '../../ai-sales/providers/web-search.provider';
import { normalizeListingUrl } from '../ai-property-finder-dedupe.util';
import type { PropertySearchResult } from '../ai-property-finder.types';
import type { PropertyDiscoveryProvider, PropertyDiscoverySearchInput } from './property-discovery.provider';

@Injectable()
export class SearchEnginePropertyProvider implements PropertyDiscoveryProvider {
  readonly name = 'SearchEngineProvider';
  readonly sourceType = 'EXTERNAL_SEARCH' as const;
  private readonly log = new Logger(SearchEnginePropertyProvider.name);

  constructor(private readonly webSearch: WebSearchProvider) {}

  isConfigured(): boolean {
    return this.webSearch.isConfigured();
  }

  async search(input: PropertyDiscoverySearchInput): Promise<Omit<PropertySearchResult, 'matchScore' | 'matchReasons'>[]> {
    if (!this.isConfigured()) return [];
    const c = input.criteria;
    const type = c.propertyType ?? c.propertyTypeKey ?? 'nemovitost';
    const tx = c.transaction === 'rent' ? 'pronájem' : 'prodej';
    const loc = c.location ?? 'Česko';
    const priceHint = c.priceMax ? ` do ${Math.round(c.priceMax / 1_000_000)} mil` : '';
    const query = `${tx} ${type} ${loc}${priceHint} site:.cz`;
    const limit = Math.min(8, input.limit ?? 6);

    try {
      const hits = await this.webSearch.searchRaw(query, limit);
      const now = new Date().toISOString();
      const rows: Omit<PropertySearchResult, 'matchScore' | 'matchReasons'>[] = [];
      for (const hit of hits) {
        const url = hit.url?.trim();
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) continue;
        if (url.includes('xxrealit.cz')) continue;
        rows.push({
          id: `ext:${normalizeListingUrl(url)}`,
          source: hit.provider ?? 'Web',
          sourceType: 'EXTERNAL_SEARCH',
          sourceUrl: url,
          canonicalUrl: normalizeListingUrl(url),
          title: hit.title?.slice(0, 200) || 'Externí nabídka',
          propertyType: type,
          transactionType: c.transaction,
          price: null,
          currency: 'CZK',
          location: loc,
          descriptionSnippet: hit.snippet?.slice(0, 280),
          imageUrl: null,
          imageUsageAllowed: false,
          contactDisplayAllowed: false,
          discoveredAt: now,
          lastVerifiedAt: now,
          isInternal: false,
          isExternal: true,
        });
      }
      return rows;
    } catch (err) {
      this.log.warn(`External search failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }
}
