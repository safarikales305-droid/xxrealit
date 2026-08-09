import { Injectable } from '@nestjs/common';

type CacheEntry = {
  expiresAt: number;
  value: unknown;
  createdAt: number;
};

export type HotelbedsCacheEntryMeta = {
  key: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  ttlMs: number;
  type: 'content' | 'content-meta' | 'content-batch' | 'image' | 'search' | 'avail' | 'other';
};

export type HotelbedsCacheInspection = {
  totalEntries: number;
  contentEntries: number;
  contentMetaEntries: number;
  imageEntries: number;
  searchEntries: number;
  availEntries: number;
  otherEntries: number;
  expiredEntries: number;
  oldestEntry: string | null;
  newestEntry: string | null;
  defaultContentTtlHours: number;
  keys: string[];
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

  /** Read without affecting hit/miss counters (for diagnostics). */
  peek<T>(key: string): T | null {
    const row = this.store.get(key);
    if (!row) return null;
    if (Date.now() > row.expiresAt) return null;
    return row.value as T;
  }

  has(key: string): boolean {
    return this.peek(key) != null;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    const now = Date.now();
    this.store.set(key, { value, expiresAt: now + ttlMs, createdAt: now });
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

  private classifyKey(key: string): HotelbedsCacheEntryMeta['type'] {
    if (key.startsWith('content-meta:')) return 'content-meta';
    if (key.startsWith('content:')) return 'content';
    if (key.startsWith('content-batch:')) return 'content-batch';
    if (key.startsWith('image:')) return 'image';
    if (key.startsWith('search')) return 'search';
    if (key.startsWith('avail:')) return 'avail';
    return 'other';
  }

  inspect(limit = 100): HotelbedsCacheInspection {
    const now = Date.now();
    let contentEntries = 0;
    let contentMetaEntries = 0;
    let imageEntries = 0;
    let searchEntries = 0;
    let availEntries = 0;
    let otherEntries = 0;
    let expiredEntries = 0;
    let oldest: number | null = null;
    let newest: number | null = null;
    const keys: string[] = [];

    for (const [key, row] of this.store.entries()) {
      const type = this.classifyKey(key);
      const expired = now > row.expiresAt;
      if (expired) expiredEntries++;
      if (type === 'content') contentEntries++;
      else if (type === 'content-meta') contentMetaEntries++;
      else if (type === 'image') imageEntries++;
      else if (type === 'search') searchEntries++;
      else if (type === 'avail') availEntries++;
      else otherEntries++;

      if (!expired && keys.length < limit) keys.push(key);
      if (oldest == null || row.createdAt < oldest) oldest = row.createdAt;
      if (newest == null || row.createdAt > newest) newest = row.createdAt;
    }

    return {
      totalEntries: this.store.size,
      contentEntries,
      contentMetaEntries,
      imageEntries,
      searchEntries,
      availEntries,
      otherEntries,
      expiredEntries,
      oldestEntry: oldest ? new Date(oldest).toISOString() : null,
      newestEntry: newest ? new Date(newest).toISOString() : null,
      defaultContentTtlHours: 24,
      keys: keys.sort(),
    };
  }

  getEntryMeta(key: string): HotelbedsCacheEntryMeta | null {
    const row = this.store.get(key);
    if (!row) return null;
    const now = Date.now();
    return {
      key,
      createdAt: new Date(row.createdAt).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
      expired: now > row.expiresAt,
      ttlMs: Math.max(0, row.expiresAt - now),
      type: this.classifyKey(key),
    };
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
