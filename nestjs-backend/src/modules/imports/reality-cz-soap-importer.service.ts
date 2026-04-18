import { Injectable } from '@nestjs/common';
import type { ImportedListingDraft } from './import-types';
import { RealityCzSoapClientService } from './reality-cz-soap-client.service';

@Injectable()
export class RealityCzSoapImporter {
  constructor(private readonly soapClient: RealityCzSoapClientService) {}

  supportsConfiguredRun(): boolean {
    return this.soapClient.isConfigured();
  }

  async fetch(limit: number): Promise<ImportedListingDraft[]> {
    return this.soapClient.fetchListings(limit);
  }
}

