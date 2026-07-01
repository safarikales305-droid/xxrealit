import { Injectable } from '@nestjs/common';
import { maskAccessToken } from '../autopost/social-autopost.types';

@Injectable()
export class TikTokTokenService {
  maskToken(token: string | null | undefined): string | null {
    if (!token?.trim()) return null;
    return maskAccessToken(token.trim());
  }
}
