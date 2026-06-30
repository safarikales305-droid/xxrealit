import { permanentRedirect } from 'next/navigation';
import { getServerSideApiBaseUrl } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
};

/** SEO alias pro klasický inzerát — kanonická URL /inzerat/{slug}. */
export default async function InzeratSeoPage({ params }: Props) {
  const { slug } = await params;
  const apiBase = getServerSideApiBaseUrl();
  if (!apiBase) {
    permanentRedirect(`/nemovitosti/${slug}`);
  }
  const res = await fetch(`${apiBase}/seo/properties/by-slug/${encodeURIComponent(slug)}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    permanentRedirect(`/nemovitosti/${slug}`);
  }
  permanentRedirect(`/nemovitosti/${slug}`);
}
