'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestFetchPostDetail, type ListingPost } from '@/lib/nest-client';

export default function PostDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const postId = params?.id ?? '';
  const { isAuthenticated } = useAuth();
  const [post, setPost] = useState<ListingPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!post) return;
    console.log(post.media);
  }, [post]);
  function scrollToIndex(index: number) {
    const el = carouselRef.current;
    if (!el) return;
    const safeIndex = Math.max(0, Math.min(index, orderedMedia.length - 1));
    const width = el.clientWidth;
    el.scrollTo({ left: safeIndex * width, behavior: 'smooth' });
    setActiveIndex(safeIndex);
  }

  function scrollLeft() {
    scrollToIndex(activeIndex - 1);
  }

  function scrollRight() {
    scrollToIndex(activeIndex + 1);
  }

  function onCarouselScroll() {
    const el = carouselRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / width);
    if (idx !== activeIndex) setActiveIndex(idx);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-4">
      <button
        type="button"
        onClick={() => {
          if (searchParams?.get('from') === 'shorts') {
            router.push('/?tab=shorts');
            return;
          }
          router.push('/');
        }}
        className="mb-4 inline-flex items-center rounded-full border px-4 py-2 text-sm"
      >
        ← Zpět na Shorts inzeráty
      </button>
      <Link href="/" className="text-sm font-semibold text-orange-600">
        ← Zpět
      </Link>

      {loading ? <p className="mt-4 text-sm text-zinc-600">Načítám…</p> : null}
      {!loading && !post ? (
        <p className="mt-4 text-sm text-zinc-600">Inzerát nebyl nalezen.</p>
      ) : null}

      {post ? (
        <article className="mt-4 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {orderedMedia.length > 0 ? (
            <div className="relative w-full">
              <div
                ref={carouselRef}
                onScroll={onCarouselScroll}
                className="flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
              >
                {orderedMedia.map((m, i) => (
                  <div key={m.id} className="w-full shrink-0 snap-center bg-black">
                    {m.type === 'image' ? (
                      <img
                        src={nestAbsoluteAssetUrl(m.url)}
                        alt=""
                        className="h-auto w-full object-contain"
                      />
                    ) : (
                      <video
                        src={nestAbsoluteAssetUrl(m.url)}
                        controls
                        playsInline
                        className="h-auto w-full object-contain"
                      />
                    )}
                  </div>
                ))}
              </div>
              {orderedMedia.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={scrollLeft}
                    className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-1.5 text-white md:block"
                    aria-label="Předchozí"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={scrollRight}
                    className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-1.5 text-white md:block"
                    aria-label="Další"
                  >
                    →
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {orderedMedia.length > 1 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto px-3">
              {orderedMedia.map((m, i) => (
                <button
                  key={`${m.id}-thumb`}
                  type="button"
                  onClick={() => scrollToIndex(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded ${
                    i === activeIndex ? 'ring-2 ring-orange-500' : ''
                  }`}
                >
                  {m.type === 'image' ? (
                    <img
                      src={nestAbsoluteAssetUrl(m.url)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video
                      src={nestAbsoluteAssetUrl(m.url)}
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>
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
