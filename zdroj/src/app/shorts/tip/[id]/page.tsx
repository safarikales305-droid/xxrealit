import type { Metadata } from 'next';
import { ShareGateShell } from '@/components/share/ShareGateShell';
import { TipShortsPlayer } from '@/components/tipar/TipShortsPlayer';
import { ShareListingNotFound } from '@/components/share/ShareListingStatus';
import { getAppOrigin } from '@/lib/app-url';
import { resolveListingOgImageUrl } from '@/lib/listing-og-metadata';
import { fetchShareTexts, shareTextsForType } from '@/lib/share-texts';
import { fetchTiparPostPublic, tiparPostImageUrl, tiparPostVideoUrl } from '@/lib/tipar-public';
import { tipShareUrl } from '@/lib/public-share-url';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchTiparPostPublic(id);
  if (!post) return { title: 'Tip na XXrealit' };

  const texts = await fetchShareTexts();
  const { title, description } = shareTextsForType('tip-shorts', texts);
  const pageUrl = tipShareUrl(id, true);
  const imageUrl = resolveListingOgImageUrl({
    id,
    title: post.title,
    mainImage: post.mainImage,
    images: post.images,
    videoUrl: post.videoUrl,
    generatedVideoThumbnail: post.generatedVideoUrl,
  });
  const videoUrl = tiparPostVideoUrl(post);

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'video.other',
      title,
      description,
      url: pageUrl,
      siteName: 'XXrealit.cz',
      locale: 'cs_CZ',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
      ...(videoUrl
        ? {
            videos: [
              { url: videoUrl, secureUrl: videoUrl, type: 'video/mp4', width: 720, height: 1280 },
            ],
          }
        : {}),
    },
    twitter: { card: 'summary_large_image', title, description, images: [imageUrl] },
    other: {
      'og:title': title,
      'og:description': description,
      'og:image': imageUrl,
      'og:url': pageUrl,
      'og:type': 'video.other',
    },
  };
}

export default async function ShortsTipPage({ params }: Props) {
  const { id } = await params;
  const post = await fetchTiparPostPublic(id);
  if (!post) {
    return (
      <ShareListingNotFound
        title="Tip nenalezen"
        message="Tipařský tip s tímto odkazem neexistuje nebo není veřejný."
        listingId={id}
      />
    );
  }
  if (!post.isShorts) {
    return (
      <ShareListingNotFound
        title="Tip není ve formátu Shorts"
        message="Otevřete klasický detail tipu."
        listingId={id}
      />
    );
  }
  const videoUrl = tiparPostVideoUrl(post);
  const imageUrl = tiparPostImageUrl(post);
  if (!videoUrl && imageUrl) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black px-4 text-center text-white">
        <img src={imageUrl} alt={post.title} className="mb-4 max-h-[60dvh] rounded-xl object-contain" />
        <p className="text-sm text-white/80">{post.title}</p>
        <p className="mt-2 text-xs text-white/55">Video není k dispozici — zobrazujeme náhled.</p>
      </div>
    );
  }
  if (!videoUrl) {
    return (
      <ShareListingNotFound
        title="Shorts tip bez videa"
        message="Tip existuje, ale nemá přehratelné video."
        listingId={id}
      />
    );
  }

  return (
    <ShareGateShell type="TIP_SHORTS" listingId={id}>
      <TipShortsPlayer
        videoUrl={videoUrl}
        title={post.title}
        backHref={`${getAppOrigin()}/tipy/${encodeURIComponent(id)}`}
      />
    </ShareGateShell>
  );
}
