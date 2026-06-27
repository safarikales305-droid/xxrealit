export const ANALYTICS_ONLINE_MS = 5 * 60 * 1000;

export type ParsedUserAgent = {
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
};

export function parseUserAgent(ua: string): ParsedUserAgent {
  const s = ua || '';
  const lower = s.toLowerCase();
  let deviceType: ParsedUserAgent['deviceType'] = 'desktop';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s)) deviceType = 'tablet';
  else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(s)) deviceType = 'mobile';

  let browser = 'Neznámý';
  if (lower.includes('edg/')) browser = 'Edge';
  else if (lower.includes('chrome/') && !lower.includes('chromium')) browser = 'Chrome';
  else if (lower.includes('firefox/')) browser = 'Firefox';
  else if (lower.includes('safari/') && !lower.includes('chrome')) browser = 'Safari';
  else if (lower.includes('opr/') || lower.includes('opera')) browser = 'Opera';

  let os = 'Neznámý';
  if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('mac os') || lower.includes('macintosh')) os = 'macOS';
  else if (lower.includes('android')) os = 'Android';
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS';
  else if (lower.includes('linux')) os = 'Linux';

  return { deviceType, browser, os };
}

export function extractClientIp(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) return raw.split(',')[0]?.trim() ?? '';
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp.trim();
  return '';
}

export function anonymizeIp(ip: string): string {
  if (!ip) return '';
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 4).join(':')}::`;
  }
  const octets = ip.split('.');
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  return ip;
}

const geoCache = new Map<string, { country: string; city: string; expires: number }>();

export async function resolveGeoFromIp(
  ip: string,
  headerCountry?: string,
): Promise<{ country: string; city: string }> {
  if (headerCountry && headerCountry !== 'XX') {
    return { country: headerCountry.toUpperCase(), city: '' };
  }
  if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: '', city: '' };
  }
  const cached = geoCache.get(ip);
  if (cached && cached.expires > Date.now()) {
    return { country: cached.country, city: cached.city };
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city`,
      { signal: controller.signal },
    );
    clearTimeout(t);
    if (!res.ok) return { country: '', city: '' };
    const data = (await res.json()) as { status?: string; countryCode?: string; city?: string };
    if (data.status !== 'success') return { country: '', city: '' };
    const country = (data.countryCode ?? '').toUpperCase();
    const city = data.city ?? '';
    geoCache.set(ip, { country, city, expires: Date.now() + 24 * 60 * 60 * 1000 });
    return { country, city };
  } catch {
    return { country: '', city: '' };
  }
}
