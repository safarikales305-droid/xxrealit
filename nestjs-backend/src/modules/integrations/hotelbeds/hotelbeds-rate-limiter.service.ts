import { Injectable } from '@nestjs/common';

/** Hotelbeds limit ~8 requests / 4 seconds */
@Injectable()
export class HotelbedsRateLimiterService {
  private readonly maxRequests = 8;
  private readonly windowMs = 4000;
  private timestamps: number[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  async schedule<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    const run = async (attempt: number): Promise<T> => {
      await this.waitForSlot();
      try {
        return await fn();
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 429 && attempt < retries) {
          const delay = Math.min(8000, 500 * 2 ** attempt);
          await sleep(delay);
          return run(attempt + 1);
        }
        throw err;
      }
    };

    const result = this.chain.then(() => run(0));
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async waitForSlot(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        return;
      }
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 25;
      await sleep(Math.max(25, waitMs));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
