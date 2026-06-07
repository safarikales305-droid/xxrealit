import type { LinkPreviewResponse } from '@/lib/nest-client';
import { hostnameFromUrl } from '@/lib/extract-first-url';

export function buildClientLinkPreviewFallback(url: string): LinkPreviewResponse {
  const trimmed = url.trim();
  const host = hostnameFromUrl(trimmed).toLowerCase();
  const isSreality = host.includes('sreality.cz');

  return {
    url: trimmed,
    title: isSreality ? 'Externí odkaz na nemovitost' : 'Externí odkaz',
    description: 'Kliknutím otevřete původní inzerát.',
    image: null,
    siteName: isSreality ? 'Sreality.cz' : hostnameFromUrl(trimmed) || 'Externí odkaz',
    failed: true,
  };
}
