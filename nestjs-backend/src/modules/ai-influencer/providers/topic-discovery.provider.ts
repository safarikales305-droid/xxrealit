export type TopicDiscoveryResult = {
  title: string;
  url: string;
  snippet: string;
  provider: string;
};

export interface TopicDiscoveryProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(query: string, limit?: number): Promise<TopicDiscoveryResult[]>;
}

export const TOPIC_DISCOVERY_PROVIDER = Symbol('TOPIC_DISCOVERY_PROVIDER');
