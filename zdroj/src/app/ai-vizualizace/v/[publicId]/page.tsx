import type { Metadata } from 'next';
import Link from 'next/link';
import { API_BASE_URL } from '@/lib/api';
import { BeforeAfterSlider } from '@/components/ai-visualization/BeforeAfterSlider';
import { PublicHeader } from '@/components/navigation/PublicHeader';

type SharePayload = {
  originalPreviewUrl: string | null;
  resultPreviewUrl: string | null;
  propertyType: string | null;
  style: string | null;
};

async function loadShare(publicId: string): Promise<SharePayload | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/public/ai-visualization/share/${encodeURIComponent(publicId)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as SharePayload;
  } catch {
    return null;
  }
}

type PageProps = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicId } = await params;
  const data = await loadShare(publicId);
  const images =
    data?.originalPreviewUrl && data.resultPreviewUrl
      ? [{ url: data.resultPreviewUrl, width: 1200, height: 630, alt: 'AI vizualizace XXREALIT' }]
      : undefined;
  return {
    title: 'AI vizualizace rekonstrukce | XXREALIT',
    description: 'Před a po rekonstrukci — vytvořeno pomocí AI XXREALIT.',
    openGraph: {
      title: 'XXREALIT · AI VIZUALIZACE',
      description: 'Před | Po rekonstrukci',
      images,
    },
  };
}

export default async function AiVizualizaceSharePage({ params }: PageProps) {
  const { publicId } = await params;
  const data = await loadShare(publicId);

  if (!data?.originalPreviewUrl || !data.resultPreviewUrl) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4">
        <p className="text-zinc-600">Sdílená vizualizace nebyla nalezena.</p>
        <Link href="/ai-vizualizace" className="mt-4 font-semibold text-orange-700">
          Vytvořit vlastní vizualizaci
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white">
      <PublicHeader activeSection="none" compact />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-center text-xs font-semibold uppercase text-orange-600">Vytvořeno pomocí AI XXREALIT</p>
        <h1 className="mt-2 text-center text-xl font-bold text-zinc-900">Před a po rekonstrukci</h1>
        <div className="mt-6">
          <BeforeAfterSlider beforeUrl={data.originalPreviewUrl} afterUrl={data.resultPreviewUrl} />
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/ai-vizualizace"
            className="inline-block rounded-2xl bg-orange-600 px-6 py-3 text-sm font-bold text-white"
          >
            ✨ Vytvořit vlastní vizualizaci
          </Link>
        </div>
      </main>
    </div>
  );
}
