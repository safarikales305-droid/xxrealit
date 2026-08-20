const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'metadata.goog',
]);

const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const RAILWAY_INTERNAL = /\.railway\.internal$/i;

export class NewsFetchGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NewsFetchGuardError';
  }
}

function isPrivateIpv4(host: string): boolean {
  return PRIVATE_IPV4_RANGES.some((re) => re.test(host));
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('fe80')) return true;
  return false;
}

export function assertSafeFetchUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new NewsFetchGuardError('Neplatná URL.');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new NewsFetchGuardError(`Protokol ${protocol} není povolen.`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new NewsFetchGuardError('Chybí hostname.');
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new NewsFetchGuardError(`Hostname ${hostname} není povolen.`);
  }

  if (RAILWAY_INTERNAL.test(hostname)) {
    throw new NewsFetchGuardError('Interní Railway adresa není povolena.');
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new NewsFetchGuardError(`Interní hostname ${hostname} není povolen.`);
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && isPrivateIpv4(hostname)) {
    throw new NewsFetchGuardError('Privátní IPv4 adresa není povolena.');
  }

  if (hostname.includes(':') && isBlockedIpv6(hostname)) {
    throw new NewsFetchGuardError('Privátní IPv6 adresa není povolena.');
  }

  if (hostname === '169.254.169.254') {
    throw new NewsFetchGuardError('Metadata endpoint není povolen.');
  }

  return parsed;
}

export async function guardedFetch(
  rawUrl: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const url = assertSafeFetchUrl(rawUrl);
  const timeoutMs = init?.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url.toString(), {
      ...init,
      signal: controller.signal,
      redirect: 'manual',
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function guardedFetchFollow(
  rawUrl: string,
  init?: RequestInit & { timeoutMs?: number; maxRedirects?: number },
): Promise<{
  response: Response;
  finalUrl: string;
  redirectCount: number;
}> {
  const maxRedirects = init?.maxRedirects ?? 8;
  let currentUrl = assertSafeFetchUrl(rawUrl).toString();
  let redirectCount = 0;

  for (let i = 0; i <= maxRedirects; i += 1) {
    const res = await guardedFetch(currentUrl, init);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        return { response: res, finalUrl: currentUrl, redirectCount };
      }
      redirectCount += 1;
      if (redirectCount > maxRedirects) {
        throw new NewsFetchGuardError('Příliš mnoho redirectů.');
      }
      currentUrl = new URL(location, currentUrl).toString();
      assertSafeFetchUrl(currentUrl);
      continue;
    }
    return { response: res, finalUrl: currentUrl, redirectCount };
  }

  throw new NewsFetchGuardError('Redirect loop.');
}
