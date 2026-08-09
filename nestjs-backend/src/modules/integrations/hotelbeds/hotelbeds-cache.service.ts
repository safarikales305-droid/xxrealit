import { Injectable } from '@nestjs/common';

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

@Injectable()
export class HotelbedsCacheService {
  private readonly store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  get<T>(key: string): T | null {
    const row = this.store.get(key);
    if (!row) {
      this.misses++;
      return null;
    }
    if (Date.now() > row.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return row.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  clear(prefix?: string): number {
    if (!prefix) {
      const n = this.store.size;
      this.store.clear();
      return n;
    }
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Math.round((this.hits / total) * 100) : 0,
      size: this.store.size,
    };
  }
}
