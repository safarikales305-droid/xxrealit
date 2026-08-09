import { Injectable } from '@nestjs/common';

export type HotelbedsApiLog = {
  at: string;
  method: string;
  endpoint: string;
  status: number;
  responseTimeMs: number;
  errorCode?: string;
  cached?: boolean;
};

@Injectable()
export class HotelbedsMetricsService {
  private requestsToday = 0;
  private errorsToday = 0;
  private dayKey = todayKey();
  private lastSearch: { at: string; destination: string; total: number } | null = null;
  private lastContentSync: { at: string; hotels: number } | null = null;
  private readonly logs: HotelbedsApiLog[] = [];
  private readonly maxLogs = 200;

  recordRequest(log: Omit<HotelbedsApiLog, 'at'>): void {
    this.rotateDayIfNeeded();
    this.requestsToday++;
    if (log.status >= 400) this.errorsToday++;
    this.logs.unshift({ ...log, at: new Date().toISOString() });
    if (this.logs.length > this.maxLogs) this.logs.length = this.maxLogs;
  }

  recordSearch(destination: string, total: number): void {
    this.lastSearch = { at: new Date().toISOString(), destination, total };
  }

  recordContentSync(hotels: number): void {
    this.lastContentSync = { at: new Date().toISOString(), hotels };
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
    };
  }

  getLogs(limit = 50): HotelbedsApiLog[] {
    return this.logs.slice(0, Math.min(limit, this.maxLogs));
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
