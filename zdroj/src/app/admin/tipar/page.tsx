'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminHideTiparPost,
  nestAdminTiparPosts,
  nestAdminTiparStats,
  type TiparPostRow,
} from '@/lib/nest-client';

export default function AdminTiparPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [posts, setPosts] = useState<TiparPostRow[]>([]);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!apiAccessToken || user?.role !== 'ADMIN') return;
    void (async () => {
      setPosts(await nestAdminTiparPosts(apiAccessToken));
      setStats(await nestAdminTiparStats(apiAccessToken));
    })();
  }, [apiAccessToken, user?.role]);

  async function hidePost(id: string) {
    if (!apiAccessToken) return;
    setBusyId(id);
    await nestAdminHideTiparPost(apiAccessToken, id);
    setPosts(await nestAdminTiparPosts(apiAccessToken));
    setBusyId(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Tipaři</h1>

      {stats ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ['Tipů celkem', stats.postsTotal],
            ['Odemčení', stats.unlocksTotal],
            ['Tipařů', stats.tiparsCount],
            ['Kredit tipařům', stats.totalCreditsEarned],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-xl font-semibold">{String(val ?? 0)}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-8 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-xs text-zinc-600">
            <tr>
              <th className="px-3 py-2">Tip</th>
              <th className="px-3 py-2">Tipař</th>
              <th className="px-3 py-2">Odemčení</th>
              <th className="px-3 py-2">Cena kontaktu</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id} className="border-b border-zinc-50">
                <td className="px-3 py-2">
                  <Link href={`/tipar/${p.id}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  {p.isShorts ? (
                    <span className="ml-2 text-xs text-amber-700">Shorts</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{p.author?.name ?? p.userId}</td>
                <td className="px-3 py-2">{p.unlockCount ?? 0}</td>
                <td className="px-3 py-2">{p.contactUnlockPrice} Kč</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void hidePost(p.id)}
                    className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                  >
                    Skrýt
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
