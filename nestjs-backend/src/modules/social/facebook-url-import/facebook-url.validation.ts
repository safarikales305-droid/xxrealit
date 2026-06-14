import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FACEBOOK_URL_ALLOWED_HOSTS } from './facebook-url-import.constants';

const POST_PATH_RE =
  /(?:\/posts\/|\/permalink\/|\/photos\/|\/photo\.php|\/videos\/|\/video\.php|\/reel\/|\/watch\/?\?|story\.php|permalink\.php|story_fbid)/i;

function parseFacebookUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BadRequestException('Zadejte URL Facebook stránky.');
  }
  try {
    return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new BadRequestException('Neplatná URL Facebook stránky.');
  }
}

function assertAllowedHost(url: URL) {
  const hostBare = url.hostname.toLowerCase();
  if (
    !FACEBOOK_URL_ALLOWED_HOSTS.has(hostBare) &&
    hostBare !== 'facebook.com' &&
    hostBare !== 'www.facebook.com' &&
    hostBare !== 'm.facebook.com' &&
    hostBare !== 'mbasic.facebook.com'
  ) {
    throw new BadRequestException(
      'Povolené jsou pouze URL z domény facebook.com (www, m, mbasic).',
    );
  }
}

export function normalizeFacebookPageUrl(raw: string): string {
  const url = parseFacebookUrl(raw);
  assertAllowedHost(url);
  url.protocol = 'https:';
  if (url.hostname.toLowerCase() === 'm.facebook.com') {
    return url.toString().replace(/\/+$/, '');
  }
  url.hostname = 'www.facebook.com';
  return url.toString().replace(/\/+$/, '');
}

export function normalizeFacebookPostUrl(raw: string): string {
  const url = parseFacebookUrl(raw);
  assertAllowedHost(url);
  const full = url.toString();
  if (!POST_PATH_RE.test(`${url.pathname}${url.search}`)) {
    throw new BadRequestException(
      'URL musí odkazovat na konkrétní Facebook příspěvek (posts, permalink, reel, video, photo, story_fbid).',
    );
  }
  url.protocol = 'https:';
  url.hostname = 'www.facebook.com';
  url.hash = '';
  return url.toString();
}

export function externalIdForFacebookPostUrl(permalink: string): string {
  return createHash('sha256').update(permalink.trim()).digest('hex').slice(0, 40);
}

export function isAllowedFacebookHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'facebook.com' ||
    h === 'www.facebook.com' ||
    h === 'm.facebook.com' ||
    h === 'mbasic.facebook.com'
  );
}

export function isFacebookPostUrl(raw: string): boolean {
  try {
    const url = parseFacebookUrl(raw);
    assertAllowedHost(url);
    return POST_PATH_RE.test(`${url.pathname}${url.search}`);
  } catch {
    return false;
  }
}
