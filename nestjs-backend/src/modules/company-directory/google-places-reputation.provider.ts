import { Injectable, Logger } from '@nestjs/common';
import { GOOGLE_COMPANY_ENRICHMENT_ENABLED } from './company-directory.constants';
import type {
  CompanyReputationProvider,
  CompanyReputationSnapshot,
} from './company-reputation.provider';

/** Připraveno pro fázi 2 – Google Places API (New). Zatím neaktivní. */
@Injectable()
export class GooglePlacesReputationProvider implements CompanyReputationProvider {
  readonly providerId = 'google_places';
  private readonly log = new Logger(GooglePlacesReputationProvider.name);

  isEnabled(): boolean {
    return GOOGLE_COMPANY_ENRICHMENT_ENABLED;
  }

  async matchPlace(): Promise<CompanyReputationSnapshot | null> {
    if (!this.isEnabled()) {
      this.log.debug('Google enrichment disabled – skip matchPlace');
      return null;
    }
    return null;
  }

  async fetchReputation(): Promise<CompanyReputationSnapshot | null> {
    if (!this.isEnabled()) {
      this.log.debug('Google enrichment disabled – skip fetchReputation');
      return null;
    }
    return null;
  }
}
