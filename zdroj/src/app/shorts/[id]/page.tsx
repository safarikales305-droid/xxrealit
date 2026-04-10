'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { absoluteShareUrl } from '@/lib/public-share-url';
import { ShareButtons } from '@/components/share/ShareButtons';
import { nestFetchVideos, type ShortVideo } from '@/lib/nest-client';

export default function ShortDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { isAuthenticated } = useAuth();
  const [video, setVideo] = useState<ShortVideo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void nestFetchVideos()
      .then((list) => {
        const v = list.find((x) => x.id === id) ?? null;
        setVideo(v);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const src = nestAbsoluteAssetUrl(video?.videoUrl ?? video?.url ?? '');
  const shareTitle = (video?.title ?? 'Shorts').trim().slice(0, 120) || 'Shorts';
  const shareUrl = absoluteShareUrl(`/shorts/${encodeURIComponent(id)}`);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-black px-3 py-4 text-white">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="rounded-full border border-white/30 px-4 py-2 text-sm"
        >
          ← Zpět
        </button>
        {video ? <ShareButtons title={shareTitle} url={shareUrl} variant="pill" label="Sdílet" /> : null}
      </div>

      {loading ? <p className="text-sm text-white/70">Načítám…</p> : null}
      {!loading && !video ? (
        <p className="text-sm text-white/70">Video nebylo nalezeno.</p>
      ) : null}

      {video && src ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/10">
          <video
            src={src}
            muted
            playsInline
            controls
            autoPlay
            loop
            className="aspect-[9/16] w-full object-cover"
          />
          <div className="border-t border-white/10 bg-black/80 p-4">
            <p className="text-lg font-semibold">{video.title}</p>
            <p className="mt-1 text-sm text-white/80">
              <span className={!isAuthenticated ? 'blur-sm' : ''}>
                {Number(video.price ?? 0).toLocaleString('cs-CZ')} Kč
              </span>{' '}
              · {video.city ?? ''}
            </p>
            <Link
              href={`/prispevky/${encodeURIComponent(id)}`}
              className="mt-3 inline-block text-sm font-semibold text-orange-400"
            >
              Otevřít detail příspěvku
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}
