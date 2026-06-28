'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { TipCreateForm } from '@/components/tipar/tip-create-form';
import { TiparEarningsSection } from '@/components/tipar/tipar-earnings-section';
import {
  nestFetchMe,
  nestTiparDeletePost,
  nestTiparMyPosts,
  type TiparPostRow,
} from '@/lib/nest-client';

export default function ProfilTipyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [posts, setPosts] = useState<TiparPostRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPost, setEditingPost] = useState<TiparPostRow | null>(null);
  const [focusShorts, setFocusShorts] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);

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
      if (me.profileRequirements?.canUseTipar === false) {
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

  function openCreate() {
    setEditingPost(null);
    setFocusShorts(false);
    setShowForm(true);
  }

  function openEdit(post: TiparPostRow, shorts = false) {
    setEditingPost(post);
    setFocusShorts(shorts);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingPost(null);
    setFocusShorts(false);
  }

  async function deletePost(postId: string) {
    if (!apiAccessToken) return;
    if (!window.confirm('Opravdu smazat tento tip?')) return;
    setDeletingId(postId);
    const r = await nestTiparDeletePost(apiAccessToken, postId);
    setDeletingId(null);
    if (r.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      if (editingPost?.id === postId) closeForm();
    }
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
          onClick={() => (showForm && !editingPost ? closeForm() : openCreate())}
          className="rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
        >
          {showForm && !editingPost ? 'Zavřít formulář' : 'Vytvořit tip'}
        </button>
      </div>

      <TiparEarningsSection />

      {publishSuccess ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Tip byl publikován
        </p>
      ) : null}

      {showForm ? (
        <div className="mb-8">
          <TipCreateForm
            key={editingPost?.id ?? 'new'}
            editTip={editingPost}
            focusShorts={focusShorts}
            onCancel={closeForm}
            onSaved={() => {
              closeForm();
              setPublishSuccess(true);
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
                  <img src={thumb} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ) : p.videoUrl ? (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-[10px] font-semibold text-white">
                    Video
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-900">{p.title}</p>
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                    >
                      Upravit
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === p.id}
                      onClick={() => void deletePost(p.id)}
                      className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Smazat
                    </button>
                    <Link
                      href={`/tipar/${p.id}`}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                    >
                      Zobrazit detail
                    </Link>
                    <button
                      type="button"
                      onClick={() => openEdit(p, true)}
                      className="rounded-full border border-[#e85d00]/40 px-3 py-1 text-xs font-semibold text-[#e85d00] hover:bg-orange-50"
                    >
                      {p.isShorts ? 'Upravit Shorts' : 'Převést na Shorts'}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {posts.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">
            Zatím nemáte žádné tipy.
          </li>
        ) : null}
      </ul>
    </main>
  );
}
