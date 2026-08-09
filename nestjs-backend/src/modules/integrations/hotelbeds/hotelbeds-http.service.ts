import { Injectable, Logger } from '@nestjs/common';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsConfigService } from './hotelbeds.config';
import { formatHotelbedsErrorBody, maskContentRequestParams } from './hotelbeds-normalizer';
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
    readonly errorBody?: string,
    readonly requestParams?: string,
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
          endpoint: opts.label ?? maskContentRequestParams(url),
          status: 200,
          responseTimeMs: 0,
          cached: true,
        });
        return cached;
      }
    }
    const creds = this.getCredentials();
    if (!creds) throw new Error('Hotelbeds credentials missing');

    const requestParams = maskContentRequestParams(url);
    const endpointLabel = opts?.label ?? requestParams.split('?')[0] ?? 'content';
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

    const errorBody = response.ok ? undefined : formatHotelbedsErrorBody(bodyText);
    const errorMessage = errorBody?.split('\n').find((l) => l.startsWith('Message:'))?.replace('Message: ', '');

    this.metrics.recordRequest({
      method: 'GET',
      endpoint: endpointLabel,
      status: response.status,
      responseTimeMs,
      errorCode: response.ok ? undefined : String(response.status),
      errorMessage,
      errorBody,
      requestParams,
    });

    if (!response.ok) {
      this.logBookingError('GET', endpointLabel, response.status, errorBody, requestParams);
      throw new HotelbedsHttpError(
        `Hotelbeds HTTP ${response.status}`,
        response.status,
        url,
        responseTimeMs,
        errorBody,
        requestParams,
      );
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

    const errorBody = response.ok ? undefined : formatHotelbedsErrorBody(bodyText);
    const errorMessage = errorBody?.split('\n').find((l) => l.startsWith('Message:'))?.replace('Message: ', '');

    this.metrics.recordRequest({
      method: 'POST',
      endpoint: label ?? url,
      status: response.status,
      responseTimeMs,
      errorCode: response.ok ? undefined : String(response.status),
      errorMessage,
      errorBody,
      requestParams: label ? JSON.stringify(body).slice(0, 300) : undefined,
    });

    if (!response.ok) {
      this.logBookingError('POST', label ?? url, response.status, errorBody, label);
      throw new HotelbedsHttpError(
        `Hotelbeds HTTP ${response.status}`,
        response.status,
        url,
        responseTimeMs,
        errorBody,
        label,
      );
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

  private logBookingError(
    method: string,
    endpoint: string,
    status: number,
    errorBody?: string,
    requestParams?: string,
  ): void {
    const parsed = parseHotelbedsError(errorBody);
    this.log.warn(
      JSON.stringify({
        event: 'hotelbeds_api_error',
        status,
        errorCode: parsed.code,
        errorMessage: parsed.message,
        endpoint,
        method,
        environment: this.config.environment,
        bookingBaseUrl: this.config.bookingBaseUrl,
        timestamp: new Date().toISOString(),
        requestParams: requestParams?.slice(0, 300) ?? null,
      }),
    );
  }
}

function parseHotelbedsError(errorBody?: string): { code: string | null; message: string | null } {
  if (!errorBody?.trim()) return { code: null, message: null };
  const code = errorBody.match(/Error code:\s*(.+)/i)?.[1]?.trim() ?? null;
  const message = errorBody.match(/Message:\s*(.+)/i)?.[1]?.trim() ?? errorBody.slice(0, 200);
  return { code, message };
}
