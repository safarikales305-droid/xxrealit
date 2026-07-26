import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const SERPAPI_API_KEY_ENV = 'SERPAPI_API_KEY' as const;
export const BING_SEARCH_API_KEY_ENV = 'BING_SEARCH_API_KEY' as const;

@Injectable()
export class SearchProvidersEnvService {
  constructor(private readonly config: ConfigService) {}

  /** Reads env at request time — process.env first (Railway), then ConfigService. */
  readEnvVar(key: string): string | null {
    const fromProcess = process.env[key];
    const fromConfig = this.config.get<string>(key);
    const raw = (fromProcess ?? fromConfig ?? '').trim();
    return raw || null;
  }

  getSerpApiKey(): string | null {
    return this.readEnvVar(SERPAPI_API_KEY_ENV);
  }

  isSerpApiConfigured(): boolean {
    return Boolean(this.getSerpApiKey());
  }

  getBingSearchApiKey(): string | null {
    return this.readEnvVar(BING_SEARCH_API_KEY_ENV);
  }

  isBingSearchConfigured(): boolean {
    return Boolean(this.getBingSearchApiKey());
  }

  isWebSearchConfigured(): boolean {
    return this.isSerpApiConfigured() || this.isBingSearchConfigured();
  }

  getActiveWebProvider() {
    if (this.isSerpApiConfigured()) {
      return { key: 'SERPAPI' as const, name: 'SerpAPI', envVar: SERPAPI_API_KEY_ENV };
    }
    if (this.isBingSearchConfigured()) {
      return { key: 'BING_WEB_SEARCH' as const, name: 'Bing Web Search API', envVar: BING_SEARCH_API_KEY_ENV };
    }
    return null;
  }

  getSerpApiDiagnostics() {
    const key = this.getSerpApiKey();
    const configured = Boolean(key);
    return {
      serpApiConfigured: configured,
      serpApiKeyLength: key?.length ?? 0,
      serpApiKeyMasked: configured && key ? `***${key.slice(-4)}` : null,
    };
  }

  getDeploymentDiagnostics() {
    return {
      environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown',
      serviceName: process.env.RAILWAY_SERVICE_NAME || null,
      deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || null,
      applicationVersion:
        process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || process.env.npm_package_version || null,
      nodeEnv: process.env.NODE_ENV || null,
      apiBaseHint: process.env.RAILWAY_PUBLIC_DOMAIN || null,
      ...this.getSerpApiDiagnostics(),
    };
  }
}
