import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Hotelbeds / HBX Group — X-Signature dle oficiální dokumentace:
 * SHA256 hex( ApiKey + Secret + UnixTimestampSeconds )
 * @see https://developer.hotelbeds.com/documentation/getting-started/
 */
@Injectable()
export class HotelbedsSignatureService {
  createSignature(apiKey: string, secret: string, timestampSeconds?: number): string {
    const ts = timestampSeconds ?? Math.floor(Date.now() / 1000);
    const payload = `${apiKey}${secret}${ts}`;
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  buildAuthHeaders(apiKey: string, secret: string): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Api-key': apiKey,
      'X-Signature': this.createSignature(apiKey, secret, timestamp),
    };
  }
}
