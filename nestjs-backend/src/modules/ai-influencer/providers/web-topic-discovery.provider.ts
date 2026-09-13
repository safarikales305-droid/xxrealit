import { Injectable } from '@nestjs/common';
import { WebSearchProvider } from '../../ai-sales/providers/web-search.provider';
import type {
  TopicDiscoveryProvider,
  TopicDiscoveryResult,
} from './topic-discovery.provider';

@Injectable()
export class WebTopicDiscoveryProvider implements TopicDiscoveryProvider {
  readonly name = 'WebSearchProvider';

  constructor(private readonly webSearch: WebSearchProvider) {}

  isConfigured(): boolean {
    return this.webSearch.isConfigured();
  }

  async search(query: string, limit = 8): Promise<TopicDiscoveryResult[]> {
    const rows = await this.webSearch.searchRaw(query, limit);
    return rows.map((row) => ({
      title: row.title,
      url: row.url,
      snippet: row.snippet,
      provider: row.provider,
    }));
  }
}
