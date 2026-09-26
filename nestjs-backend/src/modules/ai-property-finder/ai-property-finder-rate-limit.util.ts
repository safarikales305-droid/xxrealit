type Bucket = { count: number; resetAt: number };

export class AiPropertyFinderRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  assertAllowed(key: string, maxRequests: number, windowMs: number): void {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (bucket.count >= maxRequests) {
      throw new Error('RATE_LIMIT');
    }
    bucket.count += 1;
  }
}
