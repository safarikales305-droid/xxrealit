'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestConversationsList, type NestConversationListItem } from '@/lib/nest-client';

type Folder = 'inbox' | 'sent' | 'all';

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function counterpartLabel(c: NestConversationListItem): string {
  const n = c.counterpart.name?.trim();
  if (n) return n;
  const e = c.counterpart.email?.trim();
  if (e) return e;
  return 'Uživatel';
}

export default function ProfilZpravyPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, apiAccessToken } = useAuth();
  const [folder, setFolder] = useState<Folder>('inbox');
  const [rows, setRows] = useState<NestConversationListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiAccessToken) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const data = await nestConversationsList(apiAccessToken, folder);
    setLoading(false);
    if (!data) {
      setError('Konverzace se nepodařilo načíst.');
      setRows([]);
      return;
    }
    setRows(data);
  }, [apiAccessToken, folder]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/prihlaseni?redirect=${encodeURIComponent('/profil/zpravy')}`);
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center bg-[#fafafa] text-zinc-600">
        Načítání…
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16 text-zinc-900">
      <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/profil"
            className="text-sm font-semibold text-[#e85d00] hover:underline"
          >
            ← Profil
          </Link>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Zprávy</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Konverzace k inzerátům — doručené a odeslané.
        </p>

        <div className="mt-6 flex gap-1 rounded-xl bg-zinc-100 p-1">
          {(
            [
              ['inbox', 'Doručené'],
              ['sent', 'Odeslané'],
              ['all', 'Všechny'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFolder(key)}
              className={`flex-1 rounded-lg py-2 text-center text-xs font-semibold transition sm:text-sm ${
                folder === key
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {!apiAccessToken ? (
          <p className="mt-6 text-sm text-amber-800">
            Pro zprávy je potřeba přihlášení s JWT (cookie{' '}
            <code className="rounded bg-amber-100 px-1">token</code>) a nastavené{' '}
            <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_URL</code>.
          </p>
        ) : null}

        {loading ? (
          <p className="mt-8 text-sm text-zinc-500">Načítám konverzace…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-red-600">{error}</p>
        ) : !rows || rows.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600">Zatím žádné konverzace v této složce.</p>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((c) => {
              const last = c.lastMessage;
              const cover = c.propertyImageUrl
                ? nestAbsoluteAssetUrl(c.propertyImageUrl)
                : '';
              return (
                <li key={c.id}>
                  <Link
                    href={`/profil/zpravy/${c.id}`}
                    className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50/80"
                  >
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="size-14 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
                        —
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {counterpartLabel(c)}
                        </p>
                        {c.unreadCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-white">
                            {c.unreadCount > 99 ? '99+' : c.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                        {c.propertyTitle}
                      </p>
                      {last ? (
                        <>
                          <p className="mt-1 line-clamp-2 text-sm text-zinc-700">{last.body}</p>
                          <p className="mt-1 text-xs text-zinc-400">{formatWhen(last.createdAt)}</p>
                        </>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
