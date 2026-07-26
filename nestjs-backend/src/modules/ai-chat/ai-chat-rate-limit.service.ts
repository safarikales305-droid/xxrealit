import { Injectable } from '@nestjs/common';

type Bucket = { minute: number[]; hour: number[] };

@Injectable()
export class AiChatRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  check(sessionKey: string, limits: { perMinute: number; perHour: number }): { ok: boolean; reason?: string } {
    const now = Date.now();
    const bucket = this.buckets.get(sessionKey) ?? { minute: [], hour: [] };
    bucket.minute = bucket.minute.filter((t) => now - t < 60_000);
    bucket.hour = bucket.hour.filter((t) => now - t < 3_600_000);
    if (bucket.minute.length >= limits.perMinute) {
      return { ok: false, reason: 'RATE_LIMIT_MINUTE' };
    }
    if (bucket.hour.length >= limits.perHour) {
      return { ok: false, reason: 'RATE_LIMIT_HOUR' };
    }
    bucket.minute.push(now);
    bucket.hour.push(now);
    this.buckets.set(sessionKey, bucket);
    return { ok: true };
  }
}
