import { Injectable, Logger } from '@nestjs/common';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsMetricsService } from './hotelbeds-metrics.service';
import { HotelbedsRateLimiterService } from './hotelbeds-rate-limiter.service';
import { HotelbedsSignatureService } from './hotelbeds-signature.service';

const REQUEST_TIMEOUT_MS = 20_000;

export class HotelbedsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly responseTimeMs: number,
  ) {
    super(message);
    this.name = 'HotelbedsHttpError';
  }
}

@Injectable()
export class HotelbedsHttpService {
  private readonly log = new Logger(HotelbedsHttpService.name);

  constructor(
    private readonly config: HotelbedsConfigService,
    private readonly signature: HotelbedsSignatureService,
    private readonly limiter: HotelbedsRateLimiterService,
    private readonly cache: HotelbedsCacheService,
    private readonly metrics: HotelbedsMetricsService,
  ) {}

  getCredentials(): { apiKey: string; secret: string } | null {
    const apiKey = this.config.apiKey;
    const secret = this.config.apiSecret;
    if (!apiKey || !secret) return null;
    return { apiKey, secret };
  }

  async getJson<T>(
    url: string,
    opts?: { cacheKey?: string; cacheTtlMs?: number; label?: string },
  ): Promise<T> {
    if (opts?.cacheKey) {
      const cached = this.cache.get<T>(opts.cacheKey);
      if (cached) {
        this.metrics.recordRequest({
          method: 'GET',
          endpoint: opts.label ?? url,
          status: 200,
          responseTimeMs: 0,
          cached: true,
        });
        return cached;
      }
    }
    const creds = this.getCredentials();
    if (!creds) throw new Error('Hotelbeds credentials missing');

    const started = Date.now();
    const response = await this.limiter.schedule(() =>
      this.signedFetch(url, creds.apiKey, creds.secret, { method: 'GET' }),
    );
    const responseTimeMs = Date.now() - started;
    const bodyText = await response.text();
    let parsed: T;
    try {
      parsed = bodyText ? (JSON.parse(bodyText) as T) : ({} as T);
    } catch {
      parsed = {} as T;
    }

    this.metrics.recordRequest({
      method: 'GET',
      endpoint: opts?.label ?? url.replace(/\?.*$/, ''),
      status: response.status,
      responseTimeMs,
      errorCode: response.ok ? undefined : String(response.status),
    });

    if (!response.ok) {
      this.log.warn(`Hotelbeds GET ${response.status} ${opts?.label ?? url}`);
      throw new HotelbedsHttpError(`Hotelbeds HTTP ${response.status}`, response.status, url, responseTimeMs);
    }

    if (opts?.cacheKey && opts.cacheTtlMs) {
      this.cache.set(opts.cacheKey, parsed, opts.cacheTtlMs);
    }
    return parsed;
  }

  async postJson<T>(url: string, body: unknown, label?: string): Promise<{ data: T; status: number; responseTimeMs: number }> {
    const creds = this.getCredentials();
    if (!creds) throw new Error('Hotelbeds credentials missing');

    const started = Date.now();
    const response = await this.limiter.schedule(() =>
      this.signedFetch(url, creds.apiKey, creds.secret, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
    const responseTimeMs = Date.now() - started;
    const bodyText = await response.text();
    let parsed: T;
    try {
      parsed = bodyText ? (JSON.parse(bodyText) as T) : ({} as T);
    } catch {
      parsed = {} as T;
    }

    this.metrics.recordRequest({
      method: 'POST',
      endpoint: label ?? url,
      status: response.status,
      responseTimeMs,
      errorCode: response.ok ? undefined : String(response.status),
    });

    if (!response.ok) {
      throw new HotelbedsHttpError(`Hotelbeds HTTP ${response.status}`, response.status, url, responseTimeMs);
    }

    return { data: parsed, status: response.status, responseTimeMs };
  }

  private async signedFetch(
    url: string,
    apiKey: string,
    secret: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...init,
        headers: {
          ...this.signature.buildAuthHeaders(apiKey, secret),
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
