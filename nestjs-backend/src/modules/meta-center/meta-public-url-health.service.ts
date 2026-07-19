import { BadRequestException, Injectable } from '@nestjs/common';
import { probeMetaPublicUrl } from './meta-public-url-health.util';
import { runMetaUrlDiagnostics } from './meta-url-diagnostics.util';

@Injectable()
export class MetaPublicUrlHealthService {
  async checkUrl(rawUrl: string | undefined) {
    const url = rawUrl?.trim();
    if (!url) {
      throw new BadRequestException('Query parametr url je povinný.');
    }
    return probeMetaPublicUrl(url);
  }

  async diagnoseUrl(rawUrl: string | undefined) {
    const url = rawUrl?.trim();
    if (!url) {
      throw new BadRequestException('Query parametr url je povinný.');
    }
    return runMetaUrlDiagnostics(url);
  }
}
