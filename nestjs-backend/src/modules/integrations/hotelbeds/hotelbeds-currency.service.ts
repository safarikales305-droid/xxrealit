import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HotelbedsCurrencyService {
  constructor(private readonly config: ConfigService) {}

  private get eurToCzk(): number {
    const raw = this.config.get<string>('HOTELBEDS_EUR_CZK_RATE');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 25.2;
  }

  toDisplayCzk(amount: number | null | undefined, currency: string | null | undefined): {
    amount: number | null;
    currency: string;
    originalAmount: number | null;
    originalCurrency: string;
  } {
    if (amount == null) {
      return { amount: null, currency: 'CZK', originalAmount: null, originalCurrency: currency ?? 'EUR' };
    }
    const cur = (currency ?? 'EUR').toUpperCase();
    if (cur === 'CZK') {
      return { amount: Math.round(amount), currency: 'CZK', originalAmount: null, originalCurrency: 'CZK' };
    }
    if (cur === 'EUR') {
      return {
        amount: Math.round(amount * this.eurToCzk),
        currency: 'CZK',
        originalAmount: Math.round(amount * 100) / 100,
        originalCurrency: 'EUR',
      };
    }
    return { amount: Math.round(amount), currency: cur, originalAmount: null, originalCurrency: cur };
  }
}
