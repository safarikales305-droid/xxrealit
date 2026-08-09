import { Injectable, Logger } from '@nestjs/common';
import { HotelbedsConfigService } from './hotelbeds.config';
import { HotelbedsSignatureService } from './hotelbeds-signature.service';
import type {
  HotelbedsTestConnectionResult,
  HotelbedsTestSearchResult,
} from './hotelbeds.types';

const REQUEST_TIMEOUT_MS = 20_000;

@Injectable()
export class HotelbedsService {
  private readonly log = new Logger(HotelbedsService.name);

  constructor(
    private readonly config: HotelbedsConfigService,
    private readonly signature: HotelbedsSignatureService,
  ) {}

  async testConnection(): Promise<HotelbedsTestConnectionResult> {
    const apiKey = this.config.apiKey;
    const secret = this.config.apiSecret;
    const environment = this.config.environment;

    if (!apiKey || !secret) {
      return {
        success: false,
        provider: 'Hotelbeds',
        environment,
        status: 0,
        responseTimeMs: 0,
        message: 'Chybí HOTELBEDS_API_KEY nebo HOTELBEDS_API_SECRET v ENV.',
        errorCode: 'MISSING_CREDENTIALS',
      };
    }

    const url = `${this.config.bookingBaseUrl}/status`;
    const started = Date.now();

    try {
      const response = await this.signedFetch(url, apiKey, secret, { method: 'GET' });
      const responseTimeMs = Date.now() - started;
      const bodyText = await response.text();
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null;
      } catch {
        parsed = null;
      }

      if (response.ok) {
        this.log.log(
          `[Hotelbeds] testConnection ok env=${environment} status=${response.status} ms=${responseTimeMs}`,
        );
        return {
          success: true,
          provider: 'Hotelbeds',
          environment,
          status: response.status,
          responseTimeMs,
          message: 'Hotelbeds API connection successful',
        };
      }

      const message = this.mapHttpError(response.status, parsed);
      this.log.warn(
        `[Hotelbeds] testConnection failed env=${environment} status=${response.status} ms=${responseTimeMs}`,
      );
      return {
        success: false,
        provider: 'Hotelbeds',
        environment,
        status: response.status,
        responseTimeMs,
        message,
        errorCode: String(response.status),
      };
    } catch (err) {
      const responseTimeMs = Date.now() - started;
      const message = this.mapFetchError(err);
      this.log.warn(`[Hotelbeds] testConnection error ms=${responseTimeMs} message=${message}`);
      return {
        success: false,
        provider: 'Hotelbeds',
        environment,
        status: 0,
        responseTimeMs,
        message,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }

  /**
   * Admin-only testovací vyhledávání — test API, bez ukládání do DB.
   * Používá geolokaci Prahy (bezpečný smoke test availability endpointu).
   */
  async testSearchHotels(): Promise<HotelbedsTestSearchResult> {
    if (this.config.environment === 'production' && !this.config.bookingEnabled) {
      return {
        success: false,
        provider: 'Hotelbeds',
        environment: this.config.environment,
        status: 403,
        responseTimeMs: 0,
        message: 'Produkční Hotelbeds vyhledávání je vypnuté (HOTELBEDS_BOOKING_ENABLED).',
      };
    }

    const apiKey = this.config.apiKey;
    const secret = this.config.apiSecret;
    if (!apiKey || !secret) {
      return {
        success: false,
        provider: 'Hotelbeds',
        environment: this.config.environment,
        status: 0,
        responseTimeMs: 0,
        message: 'Chybí HOTELBEDS_API_KEY nebo HOTELBEDS_API_SECRET.',
      };
    }

    const checkIn = this.futureDate(30);
    const checkOut = this.futureDate(32);
    const url = `${this.config.bookingBaseUrl}/hotels`;
    const body = {
      stay: { checkIn, checkOut },
      occupancies: [{ rooms: 1, adults: 2, children: 0 }],
      geolocation: {
        latitude: 50.0755,
        longitude: 14.4378,
        radius: 10,
        unit: 'km',
      },
      filter: { maxHotels: 30 },
    };

    const started = Date.now();
    try {
      const response = await this.signedFetch(url, apiKey, secret, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const responseTimeMs = Date.now() - started;
      const payload = (await response.json().catch(() => ({}))) as {
        hotels?: { hotels?: Array<{ code?: number; name?: string; categoryCode?: string }>; total?: number };
        error?: { code?: string; message?: string };
      };

      if (!response.ok) {
        const errorCode =
          typeof payload.error === 'object' && payload.error?.code
            ? String(payload.error.code)
            : String(response.status);
        const errorMessage =
          typeof payload.error === 'object' && payload.error?.message
            ? String(payload.error.message)
            : this.mapHttpError(response.status, payload as Record<string, unknown>);
        return {
          success: false,
          provider: 'Hotelbeds',
          environment: this.config.environment,
          status: response.status,
          responseTimeMs,
          message: errorMessage,
          errorCode,
          errorMessage,
          hotelsReturned: 0,
        };
      }

      const hotels = payload.hotels?.hotels ?? [];
      const hotelsFound = payload.hotels?.total ?? hotels.length;

      this.log.log(
        `[Hotelbeds] testSearch ok env=${this.config.environment} hotels=${hotelsFound} ms=${responseTimeMs}`,
      );

      return {
        success: true,
        provider: 'Hotelbeds',
        environment: this.config.environment,
        status: response.status,
        responseTimeMs,
        message: `Testovací vyhledávání úspěšné (${hotelsFound} hotelů).`,
        hotelsFound,
        hotelsReturned: hotels.length,
        errorCode: undefined,
        errorMessage: undefined,
        sample: hotels.slice(0, 5).map((h) => ({
          code: h.code != null ? String(h.code) : undefined,
          name: h.name,
          categoryCode: h.categoryCode,
        })),
      };
    } catch (err) {
      const responseTimeMs = Date.now() - started;
      return {
        success: false,
        provider: 'Hotelbeds',
        environment: this.config.environment,
        status: 0,
        responseTimeMs,
        message: this.mapFetchError(err),
      };
    }
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

  private futureDate(daysAhead: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return d.toISOString().slice(0, 10);
  }

  private mapHttpError(status: number, payload: Record<string, unknown> | null): string {
    const apiMessage =
      typeof payload?.error === 'object' && payload.error && 'message' in (payload.error as object)
        ? String((payload.error as { message?: string }).message ?? '')
        : typeof payload?.message === 'string'
          ? payload.message
          : '';

    switch (status) {
      case 401:
        return apiMessage || 'API Key nebo API Secret nejsou platné.';
      case 403:
        return apiMessage || 'Účet nemá oprávnění k tomuto API.';
      case 429:
        return 'Byl překročen API limit.';
      case 500:
      case 502:
      case 503:
        return 'Hotelbeds API momentálně hlásí interní chybu.';
      default:
        return apiMessage || `Hotelbeds API vrátilo HTTP ${status}.`;
    }
  }

  private mapFetchError(err: unknown): string {
    if (err instanceof Error && err.name === 'AbortError') {
      return 'Hotelbeds API neodpovědělo v časovém limitu.';
    }
    if (err instanceof Error) return err.message;
    return 'Nepodařilo se kontaktovat Hotelbeds API.';
  }
}
