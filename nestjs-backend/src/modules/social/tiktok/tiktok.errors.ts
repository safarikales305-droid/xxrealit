export const TIKTOK_ERROR_MESSAGES = {
  NOT_CONNECTED: 'TikTok účet není propojený.',
  TOKEN_EXPIRED: 'TikTok token expiroval, připojte účet znovu.',
  VIDEO_NOT_PUBLIC: 'Video není dostupné z veřejné URL.',
  PUBLISH_REJECTED: 'TikTok odmítl publikování.',
  RATE_LIMIT: 'TikTok limit požadavků byl překročen, publikování bude opakováno později.',
  SUCCESS: 'Video bylo úspěšně odesláno na TikTok.',
  NOT_CONFIGURED: 'TikTok API není nakonfigurováno (chybí Client Key / Secret).',
  NO_VIDEO: 'Inzerát nemá video pro publikování na TikTok.',
  LISTING_NOT_PUBLIC: 'Inzerát není veřejně dostupný.',
} as const;

export class TikTokApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly raw?: unknown,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'TikTokApiError';
  }
}
