import { Injectable, Logger } from '@nestjs/common';
import { ARES_BASE_URL } from './company-directory.constants';
import type {
  AresApiError,
  AresEconomicSubject,
  AresSearchFilter,
  AresSearchResponse,
} from './ares.types';

export class AresApiException extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
    readonly subCode?: string,
  ) {
    super(message);
    this.name = 'AresApiException';
  }
}

@Injectable()
export class AresService {
  private readonly log = new Logger(AresService.name);
  private requestsToday = 0;
  private requestsDayKey = new Date().toISOString().slice(0, 10);
  private errorsToday = 0;

  getMetrics() {
    this.rotateDayCounter();
    return {
      requestsToday: this.requestsToday,
      errorsToday: this.errorsToday,
      baseUrl: ARES_BASE_URL,
    };
  }

  async getCompanyByIco(ico: string): Promise<AresEconomicSubject> {
    const normalized = ico.replace(/\D/g, '').padStart(8, '0').slice(-8);
    const url = `${ARES_BASE_URL}/ekonomicke-subjekty/${normalized}`;
    const data = await this.requestJson<AresEconomicSubject>(url);
    if (!data?.ico) {
      throw new AresApiException(`ARES subjekt ${normalized} nenalezen.`, 404);
    }
    return data;
  }

  async searchCompanies(filter: AresSearchFilter): Promise<AresSearchResponse> {
    const url = `${ARES_BASE_URL}/ekonomicke-subjekty/vyhledat`;
    const body: AresSearchFilter = {
      start: filter.start ?? 0,
      pocet: Math.min(100, Math.max(1, filter.pocet ?? 10)),
      ...filter,
    };
    return this.requestJson<AresSearchResponse>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  normalizeAresCompany(subject: AresEconomicSubject) {
    const sidlo = subject.sidlo;
    const activities = [
      ...(subject.czNace ?? []),
      ...(subject.czNace2008 ?? []),
    ].filter(Boolean);

    const rosStatus = subject.seznamRegistraci?.stavZdrojeRos;
    const resStatus = subject.seznamRegistraci?.stavZdrojeRes;
    const companyStatus =
      rosStatus === 'AKTIVNI' || resStatus === 'AKTIVNI'
        ? 'AKTIVNI'
        : rosStatus ?? resStatus ?? 'NEZNAMY';

    const streetParts = [sidlo?.nazevUlice, sidlo?.cisloDomovni, sidlo?.cisloOrientacni]
      .filter((v) => v != null && String(v).length > 0)
      .map(String);
    const street = streetParts.length > 0 ? streetParts.join(' ') : null;

    return {
      ico: subject.ico.replace(/\D/g, '').padStart(8, '0'),
      dic: subject.dic ?? null,
      name: subject.obchodniJmeno?.trim() || `IČO ${subject.ico}`,
      legalForm: subject.pravniForma ?? subject.pravniFormaRos ?? null,
      companyStatus,
      street,
      city: sidlo?.nazevObce ?? null,
      postalCode: sidlo?.psc != null ? String(sidlo.psc) : null,
      district: sidlo?.nazevOkresu ?? null,
      region: sidlo?.nazevKraje ?? null,
      country: sidlo?.kodStatu ?? 'CZ',
      registeredAddress: sidlo?.textovaAdresa ?? null,
      businessActivities: [...new Set(activities)],
      aresRawUpdatedAt: subject.datumAktualizace
        ? new Date(subject.datumAktualizace)
        : null,
    };
  }

  private async requestJson<T>(
    url: string,
    init?: RequestInit,
  ): Promise<T> {
    this.rotateDayCounter();
    this.requestsToday += 1;

    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    let parsed: T & AresApiError;
    try {
      parsed = JSON.parse(text) as T & AresApiError;
    } catch {
      this.errorsToday += 1;
      throw new AresApiException(`ARES neplatná odpověď (${res.status}).`, res.status);
    }

    if (!res.ok || parsed.kod) {
      this.errorsToday += 1;
      const message = parsed.popis ?? `ARES chyba HTTP ${res.status}`;
      this.log.warn(`ARES ${res.status}: ${message}`);
      throw new AresApiException(message, res.status, parsed.kod, parsed.subKod);
    }

    return parsed;
  }

  private rotateDayCounter() {
    const key = new Date().toISOString().slice(0, 10);
    if (key !== this.requestsDayKey) {
      this.requestsDayKey = key;
      this.requestsToday = 0;
      this.errorsToday = 0;
    }
  }
}
