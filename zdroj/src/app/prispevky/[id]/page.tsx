import { permanentRedirect } from 'next/navigation';
import { fetchPostOgMeta } from '@/lib/post-public';
import { PrispevekDetailClient } from '@/components/posts/PrispevekDetailClient';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

/** Legacy URL /prispevky/{id} → přesměrování na SEO slug. */
export default async function LegacyPrispevekPage({ params }: Props) {
  const { id } = await params;
  const meta = await fetchPostOgMeta(id);
  if (meta?.canonicalPath) {
    permanentRedirect(meta.canonicalPath);
  }
  return <PrispevekDetailClient postId={id} />;
}
