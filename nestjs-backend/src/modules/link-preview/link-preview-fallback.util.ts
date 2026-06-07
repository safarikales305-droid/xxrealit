export type LinkPreviewResult = {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  failed?: boolean;
};

function siteNameFromHostname(hostname: string): string {
  const host = hostname.replace(/^www\./i, '');
  const parts = host.split('.');
  if (parts.length >= 2) {
    const name = parts[parts.length - 2];
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}.${parts[parts.length - 1]}`;
  }
  return host;
}

function normalizeRequestUrl(raw: string): string {
  try {
    return new URL(raw.trim()).href;
  } catch {
    return raw.trim();
  }
}

export function buildLinkPreviewFallback(rawUrl: string): LinkPreviewResult {
  const url = normalizeRequestUrl(rawUrl);
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    hostname = '';
  }

  const isSreality = hostname.includes('sreality.cz');
  const siteName = isSreality
    ? 'Sreality.cz'
    : hostname
      ? siteNameFromHostname(hostname)
      : 'Externí odkaz';

  return {
    url,
    title: isSreality ? 'Externí odkaz na nemovitost' : 'Externí odkaz',
    description: 'Kliknutím otevřete původní inzerát.',
    image: null,
    siteName,
    failed: true,
  };
}
