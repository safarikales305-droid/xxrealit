'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { TipCreateForm } from '@/components/tipar/tip-create-form';
import { nestFetchMe, nestTiparMyPosts, type TiparPostRow } from '@/lib/nest-client';

export default function ProfilTipyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [posts, setPosts] = useState<TiparPostRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!apiAccessToken) return;
    void (async () => {
      const me = await nestFetchMe(apiAccessToken);
      if (!me?.isTipar) {
        router.replace('/profil');
        return;
      }
      setPosts(await nestTiparMyPosts(apiAccessToken));
    })();
  }, [apiAccessToken, router]);

  async function refreshPosts() {
    if (!apiAccessToken) return;
    setPosts(await nestTiparMyPosts(apiAccessToken));
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/profil" className="text-sm text-zinc-500 hover:underline">
            ← Profil
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Moje tipy</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
        >
          {showForm ? 'Zavřít formulář' : 'Vytvořit tip'}
        </button>
      </div>

      {showForm ? (
        <div className="mb-8">
          <TipCreateForm
            onCancel={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              void refreshPosts();
            }}
          />
        </div>
      ) : null}

      <ul className="space-y-3">
        {posts.map((p) => {
          const thumb = p.mainImage ?? p.images?.[0] ?? null;
          return (
            <li key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex gap-3">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ) : p.videoUrl ? (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-[10px] font-semibold text-white">
                    Video
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/tipar/${p.id}`}
                        className="font-semibold text-zinc-900 hover:underline"
                      >
                        {p.title}
                      </Link>
                      <p className="mt-1 text-xs text-zinc-500">
                        {p.city}
                        {p.isShorts ? ' · Shorts' : ''} · odemčení {p.contactUnlockPrice} Kč ·{' '}
                        {p.unlockCount ?? 0}× odemčeno
                      </p>
                    </div>
                    {p.isShorts ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        Shorts tip
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {posts.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">
            Zatím nemáte žádné tipy. Klikněte na „Vytvořit tip“ a nahrajte fotky z telefonu nebo
            počítače.
          </li>
        ) : null}
      </ul>
    </main>
  );
}
