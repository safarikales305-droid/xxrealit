import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { RUIAN_MAP_REST_BASE_URL } from './ruian-vfr.official.constants';

@Injectable()
export class RuianMapService {
  private readonly log = new Logger(RuianMapService.name);

  /** Ověří prvek podle kódu přes veřejnou mapovou službu ČÚZK (diagnostika). */
  async verifyFeatureByCode(officialCode: string) {
    const url = `${RUIAN_MAP_REST_BASE_URL}/find`;
    try {
      const res = await axios.get(url, {
        timeout: 15000,
        params: {
          searchText: officialCode,
          f: 'json',
          layers: 'all',
        },
        validateStatus: (s: number) => s < 500,
      });
      return {
        ok: res.status < 400,
        status: res.status,
        results: res.data,
        note: 'Mapová služba slouží pouze pro náhled a diagnostiku, ne pro hromadný import.',
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
