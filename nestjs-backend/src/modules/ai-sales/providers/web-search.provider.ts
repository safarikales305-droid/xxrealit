import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiSalesPartnerType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PartnerSearchInput, PartnerSearchProvider, PartnerSearchResultItem } from '../partner-search.types';

@Injectable()
export class WebSearchProvider implements PartnerSearchProvider {
  private readonly log = new Logger(WebSearchProvider.name);

  constructor(private readonly config: ConfigService) {}

  getName() {
    return this.serpApiKey() ? 'SerpAPI' : this.bingKey() ? 'Bing Web Search' : 'Webový provider';
  }

  getSourceKey() {
    return 'APPROVED_WEB_PROVIDER' as const;
  }

  isConfigured() {
    return Boolean(this.bingKey() || this.serpApiKey());
  }

  async search(input: PartnerSearchInput): Promise<PartnerSearchResultItem[]> {
    if (!this.isConfigured()) return [];

    const query = this.buildQuery(input);
    if (this.serpApiKey()) {
      return this.searchSerpApi(query, input);
    }
    return this.searchBing(query, input);
  }

  private buildQuery(input: PartnerSearchInput): string {
    const typeLabel = input.partnerType?.replace(/_/g, ' ') ?? 'firma';
    const loc = [input.city, input.district, input.region].filter(Boolean).join(' ');
    const kw = (input.keywords ?? []).join(' ');
    return `${typeLabel} ${loc} ${kw} ${input.specialization ?? ''}`.trim();
  }

  private async searchBing(query: string, input: PartnerSearchInput): Promise<PartnerSearchResultItem[]> {
    const key = this.bingKey();
    if (!key) return [];

    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${Math.min(input.limit, 30)}&mkt=cs-CZ`;
    const res = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    if (!res.ok) {
      this.log.warn(`Bing search failed: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string }> };
    };

    return (data.webPages?.value ?? []).map((item) => ({
      temporaryId: randomUUID(),
      partnerType: input.partnerType ?? AiSalesPartnerType.OTHER,
      companyName: item.name ?? 'Neznámá firma',
      contactName: null,
      publicEmail: null,
      publicPhone: null,
      website: item.url ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      specialization: input.keywords ?? [],
      source: 'APPROVED_WEB_PROVIDER',
      sourceUrl: item.url ?? null,
      relevanceReason: item.snippet ?? null,
      verified: false,
      duplicate: false,
      doNotContact: false,
      rawData: { provider: 'BING', snippet: item.snippet },
    }));
  }

  private async searchSerpApi(query: string, input: PartnerSearchInput): Promise<PartnerSearchResultItem[]> {
    const key = this.serpApiKey();
    if (!key) return [];

    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&hl=cs&gl=cz&num=${Math.min(input.limit, 30)}&api_key=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.log.warn(`SerpAPI search failed: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
    };

    return (data.organic_results ?? []).map((item) => ({
      temporaryId: randomUUID(),
      partnerType: input.partnerType ?? AiSalesPartnerType.OTHER,
      companyName: item.title ?? 'Neznámá firma',
      contactName: null,
      publicEmail: null,
      publicPhone: null,
      website: item.link ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      specialization: input.keywords ?? [],
      source: 'APPROVED_WEB_PROVIDER',
      sourceUrl: item.link ?? null,
      relevanceReason: item.snippet ?? null,
      verified: false,
      duplicate: false,
      doNotContact: false,
      rawData: { provider: 'SERPAPI', snippet: item.snippet },
    }));
  }

  private bingKey() {
    return this.config.get<string>('BING_SEARCH_API_KEY')?.trim() || null;
  }

  private serpApiKey() {
    return this.config.get<string>('SERPAPI_API_KEY')?.trim() || null;
  }
}
