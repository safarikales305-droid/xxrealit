'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestFetchPostDetail, type ListingPost } from '@/lib/nest-client';

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const postId = params?.id ?? '';
  const { isAuthenticated } = useAuth();
  const [post, setPost] = useState<ListingPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    void nestFetchPostDetail(postId)
      .then((p) => setPost(p))
      .finally(() => setLoading(false));
  }, [postId]);

  const orderedMedia = useMemo(
    () => (post?.media ?? []).slice().sort((a, b) => a.order - b.order),
    [post],
  );
  const video = orderedMedia.find((m) => m.type === 'video');
  const images = orderedMedia.filter((m) => m.type === 'image');

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-4">
      <Link href="/" className="text-sm font-semibold text-orange-600">
        ← Zpět
      </Link>

      {loading ? <p className="mt-4 text-sm text-zinc-600">Načítám…</p> : null}
      {!loading && !post ? (
        <p className="mt-4 text-sm text-zinc-600">Inzerát nebyl nalezen.</p>
      ) : null}

      {post ? (
        <article className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {video ? (
            <div className="w-full bg-black">
              <video
                src={nestAbsoluteAssetUrl(video.url)}
                controls
                playsInline
                autoPlay
                muted
                loop
                className="h-auto w-full object-contain"
              />
            </div>
          ) : null}

          {images.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto px-3 py-3">
              {images.map((m) => (
                <img
                  key={m.id}
                  src={nestAbsoluteAssetUrl(m.url)}
                  alt=""
                  className="h-32 w-32 shrink-0 rounded-lg object-cover"
                />
              ))}
            </div>
          ) : null}

          <div className="px-3 py-3">
            <h1 className="text-lg font-semibold text-zinc-900">{post.title}</h1>
            <p className="mt-1 text-xl font-bold text-zinc-900">
              <span className={!isAuthenticated ? 'blur-sm' : ''}>
                {Number(post.price ?? 0).toLocaleString('cs-CZ')} Kč
              </span>
            </p>
            <p className="mt-1 text-sm text-zinc-600">{post.city}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-800">
              {post.description}
            </p>
          </div>
        </article>
      ) : null}
    </main>
  );
}
