import { Injectable } from '@nestjs/common';

import type { HotelbedsContentHistoryRow } from './hotelbeds-content-meta.types';

export type HotelbedsApiLog = {
  id: string;
  at: string;
  method: string;
  endpoint: string;
  status: number;
  responseTimeMs: number;
  errorCode?: string;
  errorMessage?: string;
  errorBody?: string;
  requestParams?: string;
  cached?: boolean;
};

export type HotelbedsContentDiagnostics = {
  bookingApiOk: boolean;
  contentApiOk: boolean;
  contentApiPermissionDenied: boolean;
  imagesOk: boolean;
  lastContentRequest: {
    endpoint: string;
    status: number;
    responseTimeMs: number;
    error?: string;
    at: string;
  } | null;
  lastSuccessfulContentRequest: {
    endpoint: string;
    status: number;
    at: string;
    hotelIds: number[];
    imagesCount: number;
  } | null;
  lastFailedContentRequest: {
    endpoint: string;
    status: number;
    at: string;
    errorCode?: string;
    errorMessage?: string;
  } | null;
  imageSourceCounts: {
    contentApi: number;
    cache: number;
    database: number;
    fallback: number;
    none: number;
  };
};

@Injectable()
export class HotelbedsMetricsService {
  private requestsToday = 0;
  private errorsToday = 0;
  private dayKey = todayKey();
  private lastSearch: { at: string; destination: string; total: number } | null = null;
  private lastContentSync: { at: string; hotels: number } | null = null;
  private lastContentRequest: HotelbedsContentDiagnostics['lastContentRequest'] = null;
  private lastSuccessfulContentRequest: HotelbedsContentDiagnostics['lastSuccessfulContentRequest'] = null;
  private lastFailedContentRequest: HotelbedsContentDiagnostics['lastFailedContentRequest'] = null;
  private readonly contentHistory: HotelbedsContentHistoryRow[] = [];
  private readonly maxContentHistory = 100;
  private imageSourceCounts = {
    contentApi: 0,
    cache: 0,
    database: 0,
    fallback: 0,
    none: 0,
  };
  private contentApiOk = false;
  private contentApiPermissionDenied = false;
  private imagesOk = false;
  private bookingApiOk = false;
  private readonly logs: HotelbedsApiLog[] = [];
  private readonly maxLogs = 200;

  recordRequest(log: Omit<HotelbedsApiLog, 'at' | 'id'>): string {
    this.rotateDayIfNeeded();
    this.requestsToday++;
    if (log.status >= 400) this.errorsToday++;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.logs.unshift({ ...log, id, at: new Date().toISOString() });
    if (this.logs.length > this.maxLogs) this.logs.length = this.maxLogs;

    if (log.endpoint.includes('content/')) {
      const at = new Date().toISOString();
      this.lastContentRequest = {
        endpoint: log.endpoint,
        status: log.status,
        responseTimeMs: log.responseTimeMs,
        error: log.errorMessage ?? log.errorBody,
        at,
      };
      if (log.status >= 200 && log.status < 300) {
        this.contentApiOk = true;
        this.lastSuccessfulContentRequest = {
          endpoint: log.endpoint,
          status: log.status,
          at,
          hotelIds: [],
          imagesCount: 0,
        };
      } else if (log.status >= 400) {
        this.lastFailedContentRequest = {
          endpoint: log.endpoint,
          status: log.status,
          at,
          errorCode: log.errorCode,
          errorMessage: log.errorMessage ?? log.errorBody,
        };
        if (log.status === 401 || log.status === 403) {
          this.contentApiPermissionDenied = true;
        }
      }
    }
    if (log.endpoint.includes('booking/') && log.status >= 200 && log.status < 300) {
      this.bookingApiOk = true;
    }
    return id;
  }

  recordSearch(destination: string, total: number): void {
    this.lastSearch = { at: new Date().toISOString(), destination, total };
  }

  recordContentSync(hotels: number, withImages: number): void {
    this.lastContentSync = { at: new Date().toISOString(), hotels };
    if (withImages > 0) this.imagesOk = true;
  }

  recordContentHistory(row: Omit<HotelbedsContentHistoryRow, 'at'> & { at?: string }): void {
    const entry: HotelbedsContentHistoryRow = { ...row, at: row.at ?? new Date().toISOString() };
    this.contentHistory.unshift(entry);
    if (this.contentHistory.length > this.maxContentHistory) {
      this.contentHistory.length = this.maxContentHistory;
    }
    if (entry.httpStatus >= 200 && entry.httpStatus < 300) {
      this.lastSuccessfulContentRequest = {
        endpoint: entry.endpoint,
        status: entry.httpStatus,
        at: entry.at,
        hotelIds: entry.hotelIds,
        imagesCount: entry.imagesCount,
      };
    } else if (entry.httpStatus >= 400) {
      this.lastFailedContentRequest = {
        endpoint: entry.endpoint,
        status: entry.httpStatus,
        at: entry.at,
        errorCode: entry.errorCode,
        errorMessage: entry.errorMessage,
      };
    }
  }

  recordImageSource(source: keyof HotelbedsContentDiagnostics['imageSourceCounts']): void {
    this.imageSourceCounts[source]++;
  }

  getContentHistory(limit = 50): HotelbedsContentHistoryRow[] {
    return this.contentHistory.slice(0, Math.min(limit, this.maxContentHistory));
  }

  getContentLogsFromApiLogs(): HotelbedsContentHistoryRow[] {
    return this.logs
      .filter((l) => l.endpoint.includes('content/'))
      .map((l) => ({
        at: l.at,
        hotelIds: parseHotelIdsFromParams(l.requestParams),
        endpoint: l.endpoint,
        httpStatus: l.status,
        imagesCount: 0,
        source: l.cached ? 'CACHE' : 'API',
        responseTimeMs: l.responseTimeMs,
        errorCode: l.errorCode,
        errorMessage: l.errorMessage ?? l.errorBody,
      }));
  }

  markContentApiPermissionDenied(): void {
    this.contentApiPermissionDenied = true;
    this.contentApiOk = false;
  }

  isContentApiDisabled(): boolean {
    return this.contentApiPermissionDenied;
  }

  setContentDiagnostics(partial: Partial<HotelbedsContentDiagnostics>): void {
    if (partial.bookingApiOk != null) this.bookingApiOk = partial.bookingApiOk;
    if (partial.contentApiOk != null) this.contentApiOk = partial.contentApiOk;
    if (partial.contentApiPermissionDenied != null) {
      this.contentApiPermissionDenied = partial.contentApiPermissionDenied;
    }
    if (partial.imagesOk != null) this.imagesOk = partial.imagesOk;
    if (partial.lastContentRequest != null) this.lastContentRequest = partial.lastContentRequest;
  }

  contentDiagnostics(): HotelbedsContentDiagnostics {
    return {
      bookingApiOk: this.bookingApiOk,
      contentApiOk: this.contentApiOk,
      contentApiPermissionDenied: this.contentApiPermissionDenied,
      imagesOk: this.imagesOk,
      lastContentRequest: this.lastContentRequest,
      lastSuccessfulContentRequest: this.lastSuccessfulContentRequest,
      lastFailedContentRequest: this.lastFailedContentRequest,
      imageSourceCounts: { ...this.imageSourceCounts },
    };
  }

  snapshot(cacheStats: { hits: number; misses: number; hitRate: number }) {
    this.rotateDayIfNeeded();
    return {
      requestsToday: this.requestsToday,
      errorsToday: this.errorsToday,
      lastSearch: this.lastSearch,
      lastContentSync: this.lastContentSync,
      cacheHitRate: cacheStats.hitRate,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      contentDiagnostics: this.contentDiagnostics(),
    };
  }

  getLogs(limit = 50): HotelbedsApiLog[] {
    return this.logs.slice(0, Math.min(limit, this.maxLogs));
  }

  getLog(id: string): HotelbedsApiLog | null {
    return this.logs.find((l) => l.id === id) ?? null;
  }

  private rotateDayIfNeeded(): void {
    const key = todayKey();
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.requestsToday = 0;
      this.errorsToday = 0;
    }
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseHotelIdsFromParams(params?: string): number[] {
  if (!params) return [];
  const m = /codes=([\d,]+)/.exec(params);
  if (!m?.[1]) return [];
  return m[1]
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n));
}
