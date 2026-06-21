'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminPurchaseAdviceArticleCreate,
  nestAdminPurchaseAdviceArticleDelete,
  nestAdminPurchaseAdviceArticleUpdate,
  nestAdminPurchaseAdviceArticlesList,
  type PurchaseAdviceArticleAdminRow,
} from '@/lib/nest-client';

const emptyForm = {
  title: '',
  imageUrl: '',
  body: '',
  category: 'obecne',
  isPublished: true,
  sortOrder: '0',
};

export default function AdminClankyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [rows, setRows] = useState<PurchaseAdviceArticleAdminRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const r = await nestAdminPurchaseAdviceArticlesList(token);
    if (!r.ok) {
      setLoadError(r.error ?? 'Načtení článků selhalo');
      return;
    }
    setRows(r.rows ?? []);
  }, [token]);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') {
      router.replace('/');
    }
  }, [isLoading, user?.role, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setFormMsg(null);
    const r = await nestAdminPurchaseAdviceArticleCreate(token, {
      title: form.title.trim(),
      imageUrl: form.imageUrl.trim() || undefined,
      body: form.body,
      category: form.category.trim() || 'obecne',
      isPublished: form.isPublished,
      sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
    });
    setCreating(false);
    if (!r.ok) {
      setFormMsg(r.error ?? 'Vytvoření selhalo');
      return;
    }
    setForm(emptyForm);
    setFormMsg('Článek byl vytvořen.');
    void refresh();
  }

  async function togglePublished(row: PurchaseAdviceArticleAdminRow) {
    if (!token) return;
    setBusyId(row.id);
    const r = await nestAdminPurchaseAdviceArticleUpdate(token, row.id, {
      isPublished: !row.isPublished,
    });
    setBusyId(null);
    if (!r.ok) {
      setLoadError(r.error ?? 'Uložení selhalo');
      return;
    }
    void refresh();
  }

  async function onDelete(id: string) {
    if (!token) return;
    if (!window.confirm('Smazat tento článek?')) return;
    setBusyId(id);
    const r = await nestAdminPurchaseAdviceArticleDelete(token, id);
    setBusyId(null);
    if (!r.ok) {
      setLoadError(r.error ?? 'Smazání selhalo');
      return;
    }
    void refresh();
  }

  if (isLoading || user?.role !== 'ADMIN') {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm text-zinc-500">Načítám…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin" className="text-sm font-semibold text-[#e85d00] hover:underline">
              ← Administrace
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900">Články / Rady</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Články se zobrazují v boxu „Rady při koupi“ na detailu inzerátu.
            </p>
          </div>
        </div>

        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Nový článek</h2>
          <form onSubmit={(e) => void onCreate(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Název článku</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">URL obrázku</span>
              <input
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
                placeholder="https://…"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Kategorie</span>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Pořadí</span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
              />
              Veřejný (zobrazit na portálu)
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Text článku</span>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={8}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
                required
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? 'Ukládám…' : 'Přidat článek'}
              </button>
              {formMsg ? <p className="mt-2 text-sm text-emerald-700">{formMsg}</p> : null}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Seznam článků</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                  <th className="px-3 py-2">Název</th>
                  <th className="px-3 py-2">Kategorie</th>
                  <th className="px-3 py-2">Stav</th>
                  <th className="px-3 py-2">Akce</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100">
                    <td className="px-3 py-3 font-medium text-zinc-900">{row.title}</td>
                    <td className="px-3 py-3 text-zinc-600">{row.category ?? '—'}</td>
                    <td className="px-3 py-3">
                      {row.isPublished ? (
                        <span className="text-emerald-700">Veřejný</span>
                      ) : (
                        <span className="text-zinc-500">Skrytý</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/rady/${row.id}`}
                          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold"
                        >
                          Náhled
                        </Link>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void togglePublished(row)}
                          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold"
                        >
                          {row.isPublished ? 'Skrýt' : 'Zveřejnit'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void onDelete(row.id)}
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700"
                        >
                          Smazat
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Zatím žádné články.</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
