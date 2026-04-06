'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, nestAbsoluteAssetUrl } from '@/lib/api';

type UserContentResponse = {
  user: {
    id: string;
    name: string | null;
    role: string;
    avatar: string | null;
  };
  videos: Array<{ id: string; url: string; description?: string | null }>;
  posts: Array<{ id: string; content: string; createdAt: string }>;
  properties: Array<{
    id: string;
    title: string;
    image?: string | null;
    images?: string[];
    description?: string;
  }>;
};

type Tab = 'videos' | 'posts' | 'properties';

export default function UserProfileContentPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id ?? '';
  const [tab, setTab] = useState<Tab>('videos');
  const [data, setData] = useState<UserContentResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!API_BASE_URL || !userId) return;
    setLoading(true);
    void fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}`, {
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setData(json as UserContentResponse | null))
      .finally(() => setLoading(false));
  }, [userId]);

  const initials = useMemo(
    () => (data?.user?.name ?? 'U').slice(0, 1).toUpperCase(),
    [data?.user?.name],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6">
      <Link href="/" className="text-sm font-semibold text-orange-600">
        ← Zpět
      </Link>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-600">Načítám profil...</p>
      ) : !data ? (
        <p className="mt-6 text-sm text-zinc-600">Profil nebyl nalezen.</p>
      ) : (
        <>
          <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-3">
              {data.user.avatar ? (
                <img
                  src={nestAbsoluteAssetUrl(data.user.avatar)}
                  alt=""
                  className="size-14 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-14 items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-700">
                  {initials}
                </div>
              )}
              <div>
                <h1 className="text-lg font-semibold">{data.user.name ?? 'Uživatel'}</h1>
                <p className="text-sm text-zinc-600">{data.user.role}</p>
              </div>
            </div>
          </section>

          <section className="mt-4">
            <div className="mb-3 flex gap-2">
              <button
                onClick={() => setTab('videos')}
                className={`rounded px-3 py-2 text-sm ${tab === 'videos' ? 'bg-orange-500 text-white' : 'bg-zinc-100'}`}
              >
                Videa
              </button>
              <button
                onClick={() => setTab('posts')}
                className={`rounded px-3 py-2 text-sm ${tab === 'posts' ? 'bg-orange-500 text-white' : 'bg-zinc-100'}`}
              >
                Příspěvky
              </button>
              <button
                onClick={() => setTab('properties')}
                className={`rounded px-3 py-2 text-sm ${tab === 'properties' ? 'bg-orange-500 text-white' : 'bg-zinc-100'}`}
              >
                Inzeráty
              </button>
            </div>

            {tab === 'videos' ? (
              <div className="space-y-3">
                {data.videos.map((video) => (
                  <article key={video.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                    <video controls className="w-full rounded" src={nestAbsoluteAssetUrl(video.url)} />
                    {video.description ? <p className="mt-2 text-sm">{video.description}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}

            {tab === 'posts' ? (
              <div className="space-y-3">
                {data.posts.map((post) => (
                  <article key={post.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                    <p className="whitespace-pre-wrap text-sm">{post.content}</p>
                  </article>
                ))}
              </div>
            ) : null}

            {tab === 'properties' ? (
              <div className="grid grid-cols-2 gap-3">
                {data.properties.map((property) => {
                  const image = property.image || property.images?.[0] || '';
                  return (
                    <Link
                      key={property.id}
                      href={`/nemovitost/${property.id}`}
                      className="rounded-xl border border-zinc-200 bg-white p-2"
                    >
                      <div className="aspect-[9/16] overflow-hidden rounded bg-zinc-100">
                        {image ? (
                          <img
                            src={nestAbsoluteAssetUrl(image)}
                            alt={property.title}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium">{property.title}</p>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
