import { BadRequestException, Injectable } from '@nestjs/common';
import {
  probeMetaPublicUrl,
  type MetaPublicUrlHealthResult,
} from './meta-public-url-health.util';

@Injectable()
export class MetaPublicUrlHealthService {
  async checkUrl(rawUrl: string | undefined): Promise<MetaPublicUrlHealthResult> {
    const url = rawUrl?.trim();
    if (!url) {
      throw new BadRequestException('Query parametr url je povinný.');
    }
    return probeMetaPublicUrl(url);
  }
}
