import { BadRequestException } from '@nestjs/common';
import { FACEBOOK_URL_ALLOWED_HOSTS } from './facebook-url-import.constants';

export function normalizeFacebookPageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BadRequestException('Zadejte URL Facebook stránky.');
  }

  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new BadRequestException('Neplatná URL Facebook stránky.');
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, 'www.');
  const hostBare = url.hostname.toLowerCase();
  if (
    !FACEBOOK_URL_ALLOWED_HOSTS.has(hostBare) &&
    !FACEBOOK_URL_ALLOWED_HOSTS.has(host) &&
    hostBare !== 'facebook.com' &&
    hostBare !== 'www.facebook.com' &&
    hostBare !== 'm.facebook.com'
  ) {
    throw new BadRequestException(
      'Povolené jsou pouze URL z domény facebook.com (www.facebook.com, m.facebook.com).',
    );
  }

  url.protocol = 'https:';
  if (hostBare === 'm.facebook.com') {
    return url.toString().replace(/\/+$/, '');
  }
  return url.toString().replace(/\/+$/, '');
}

export function isAllowedFacebookHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'facebook.com' ||
    h === 'www.facebook.com' ||
    h === 'm.facebook.com'
  );
}
