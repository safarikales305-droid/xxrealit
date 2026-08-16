'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestListMyCompanyReviews,
  nestRemoveMyCompanyReview,
  nestUpdateMyCompanyReview,
  type MyCompanyReviewRow,
} from '@/lib/company-directory-client';

export default function MyCompanyReviewsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, apiAccessToken } = useAuth();
  const [rows, setRows] = useState<MyCompanyReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editRating, setEditRating] = useState(5);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!apiAccessToken) return;
    setLoading(true);
    setErr(null);
    const data = await nestListMyCompanyReviews(apiAccessToken);
    if (!data) {
      setErr('Recenze se nepodařilo načíst. Ověřte, že máte ověřený email účtu.');
      setRows([]);
    } else {
      setRows(data);
    }
    setLoading(false);
  }, [apiAccessToken]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/prihlaseni');
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (row: MyCompanyReviewRow) => {
    setEditId(row.id);
    setEditBody(row.body || row.bodyPreview);
    setEditRating(row.rating);
  };

  const saveEdit = async () => {
    if (!apiAccessToken || !editId) return;
    setBusy(true);
    setErr(null);
    const result = await nestUpdateMyCompanyReview(apiAccessToken, editId, {
      body: editBody,
      rating: editRating,
    });
    setBusy(false);
    if (result?.error) {
      setErr(result.error);
      return;
    }
    setMsg('Recenze byla uložena a čeká na nové schválení administrátorem.');
    setEditId(null);
    await load();
  };

  const removeReview = async (id: string) => {
    if (!apiAccessToken) return;
    if (!window.confirm('Opravdu chcete požádat o odstranění recenze?')) return;
    setBusy(true);
    const result = await nestRemoveMyCompanyReview(apiAccessToken, id, 'Na žádost autora');
    setBusy(false);
    if (result?.error) {
      setErr(result.error);
      return;
    }
    setMsg('Recenze byla odstraněna.');
    await load();
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Moje recenze firem</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Recenze jsou viditelné ve vašem účtu po ověření emailu. Každá úprava vyžaduje nové schválení.
          </p>
        </div>
        <Link href="/profil/dashboard" className="text-sm font-semibold text-orange-700">
          ← Profil
        </Link>
      </div>

      {msg ? <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}
      {err ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Načítám…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border bg-white p-6 text-sm text-zinc-600">
          Zatím nemáte žádné recenze firem. Můžete je přidat na profilu firmy v sekci recenzí.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/firmy/${row.company.slug}`} className="font-semibold text-orange-700">
                    {row.company.name}
                  </Link>
                  <p className="mt-1 text-sm text-zinc-600">
                    {row.rating} ★ · {row.sentiment} · {row.statusLabel}
                  </p>
                  {row.reviewNeedsModeration ? (
                    <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      Čeká na nové schválení
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-500">{row.createdAt.slice(0, 10)}</p>
              </div>
              <p className="mt-3 text-sm text-zinc-800">{row.bodyPreview}</p>
              {row.canEdit ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1.5 text-sm"
                    onClick={() => startEdit(row)}
                  >
                    Upravit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700"
                    onClick={() => void removeReview(row.id)}
                  >
                    Smazat
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {editId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Upravit recenzi</h2>
            <label className="mt-3 block text-sm">
              Hodnocení
              <select
                value={editRating}
                onChange={(e) => setEditRating(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              Text recenze
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              Po uložení bude recenze znovu čekat na schválení administrátorem.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setEditId(null)}>
                Zrušit
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-orange-600 px-3 py-2 text-sm text-white"
                onClick={() => void saveEdit()}
              >
                Uložit změny
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
