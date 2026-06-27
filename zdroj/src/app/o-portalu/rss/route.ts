import { API_BASE_URL } from '@/lib/api';

export const revalidate = 300;

export async function GET() {
  const base = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : API_BASE_URL ? `${API_BASE_URL}/api` : null;
  if (!base) {
    return new Response('RSS unavailable', { status: 503 });
  }
  const res = await fetch(`${base}/portal-presentation/rss?locale=cs`, { next: { revalidate: 300 } });
  const xml = await res.text();
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
