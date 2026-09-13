import { Injectable, Logger } from '@nestjs/common';
import {
  fetchFacebookGraphJson,
  type GraphJsonResult,
  type ParsedFacebookGraphError,
} from './facebook-graph-autopost.util';
import { classifyMetaGraphError, isMetaGraphRateLimitError } from './meta-graph-error.util';

export type MetaGraphTelemetry = {
  connection: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
  apiStatus: 'READY' | 'RATE_LIMITED' | 'BACKOFF' | 'UNKNOWN';
  lastSuccessfulRequestAt: string | null;
  lastErrorCode: number | null;
  lastErrorMessage: string | null;
  backoffUntil: string | null;
  requestsLast5Min: number;
  requestsLast1Hour: number;
  cachedResponses: number;
  dedupedRequests: number;
};

const BACKOFF_STEPS_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];

@Injectable()
export class MetaGraphCoordinatorService {
  private readonly logger = new Logger(MetaGraphCoordinatorService.name);
  private readonly inFlight = new Map<string, Promise<GraphJsonResult<unknown>>>();
  private readonly shortCache = new Map<
    string,
    { expiresAt: number; result: GraphJsonResult<unknown> }
  >();
  private readonly requestTimestamps: number[] = [];
  private backoffUntil = 0;
  private backoffStep = 0;
  private lastSuccessfulRequestAt: string | null = null;
  private lastError: ParsedFacebookGraphError | null = null;
  private cachedResponseCount = 0;
  private dedupedRequestCount = 0;

  isInBackoff(): boolean {
    return Date.now() < this.backoffUntil;
  }

  getBackoffUntilIso(): string | null {
    return this.backoffUntil > Date.now() ? new Date(this.backoffUntil).toISOString() : null;
  }

  applyRateLimitBackoff(reason?: string): void {
    const baseMs =
      BACKOFF_STEPS_MS[Math.min(this.backoffStep, BACKOFF_STEPS_MS.length - 1)] ??
      BACKOFF_STEPS_MS[BACKOFF_STEPS_MS.length - 1];
    const jitterMs = Math.floor(Math.random() * 15_000);
    this.backoffStep += 1;
    this.backoffUntil = Date.now() + baseMs + jitterMs;
    this.logger.warn(
      `[meta-graph] rate limit backoff ${Math.round((baseMs + jitterMs) / 1000)}s${reason ? `: ${reason}` : ''}`,
    );
  }

  resetBackoff(): void {
    this.backoffStep = 0;
    this.backoffUntil = 0;
  }

  recordRequest(): void {
    const now = Date.now();
    this.requestTimestamps.push(now);
    const hourAgo = now - 60 * 60_000;
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0]! < hourAgo) {
      this.requestTimestamps.shift();
    }
  }

  getTelemetry(options?: { hasStoredConnection?: boolean }): MetaGraphTelemetry {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60_000;
    const hourAgo = now - 60 * 60_000;
    const requestsLast5Min = this.requestTimestamps.filter((ts) => ts >= fiveMinAgo).length;
    const requestsLast1Hour = this.requestTimestamps.filter((ts) => ts >= hourAgo).length;
    const inBackoff = this.isInBackoff();
    const rateLimited = this.lastError ? isMetaGraphRateLimitError(this.lastError) : false;

    return {
      connection: options?.hasStoredConnection ? 'CONNECTED' : 'UNKNOWN',
      apiStatus: inBackoff || rateLimited ? (inBackoff ? 'BACKOFF' : 'RATE_LIMITED') : 'READY',
      lastSuccessfulRequestAt: this.lastSuccessfulRequestAt,
      lastErrorCode: this.lastError?.code ?? null,
      lastErrorMessage: this.lastError?.message ?? null,
      backoffUntil: this.getBackoffUntilIso(),
      requestsLast5Min,
      requestsLast1Hour,
      cachedResponses: this.cachedResponseCount,
      dedupedRequests: this.dedupedRequestCount,
    };
  }

  async fetchJson<T = unknown>(
    url: string,
    init?: RequestInit,
    options?: { cacheTtlMs?: number; dedupeKey?: string; skipWhenBackoff?: boolean },
  ): Promise<GraphJsonResult<T>> {
    if (options?.skipWhenBackoff !== false && this.isInBackoff()) {
      return {
        ok: false,
        status: 429,
        error: {
          httpStatus: 429,
          message: 'Meta Graph API backoff active',
          userMessage: 'Meta dočasně omezuje počet API požadavků.',
          hint: 'Počkejte na konec backoff intervalu.',
          raw: null,
        },
      };
    }

    const dedupeKey = options?.dedupeKey ?? `${init?.method ?? 'GET'}:${url}`;
    const cacheTtlMs = options?.cacheTtlMs ?? 0;
    const now = Date.now();

    if (cacheTtlMs > 0) {
      const cached = this.shortCache.get(dedupeKey);
      if (cached && cached.expiresAt > now) {
        this.cachedResponseCount += 1;
        return cached.result as GraphJsonResult<T>;
      }
    }

    const inflight = this.inFlight.get(dedupeKey);
    if (inflight) {
      this.dedupedRequestCount += 1;
      return (await inflight) as GraphJsonResult<T>;
    }

    const promise = (async () => {
      this.recordRequest();
      const result = await fetchFacebookGraphJson<T>(url, init);
      if (result.ok) {
        this.lastSuccessfulRequestAt = new Date().toISOString();
        this.lastError = null;
        this.resetBackoff();
      } else {
        this.lastError = result.error;
        if (isMetaGraphRateLimitError(result.error)) {
          this.applyRateLimitBackoff(result.error.message);
        }
      }
      if (cacheTtlMs > 0) {
        this.shortCache.set(dedupeKey, { expiresAt: now + cacheTtlMs, result });
      }
      return result;
    })();

    this.inFlight.set(dedupeKey, promise as Promise<GraphJsonResult<unknown>>);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(dedupeKey);
    }
  }

  classifyError(error: ParsedFacebookGraphError): ReturnType<typeof classifyMetaGraphError> {
    return classifyMetaGraphError(error);
  }
}
