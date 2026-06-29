'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchRecruitmentTargetsAdmin,
  updateRecruitmentTargetAdmin,
  type RecruitmentTargetRow,
} from '@/lib/portal-worker-communication-api';

export default function AdminRecruitmentTargetsPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [items, setItems] = useState<RecruitmentTargetRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetchRecruitmentTargetsAdmin(apiAccessToken);
    setItems(r.items ?? []);
  }, [apiAccessToken]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void load();
  }, [user, isLoading, router, load]);

  function updateLocal(id: string, patch: Partial<RecruitmentTargetRow>) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function save(row: RecruitmentTargetRow) {
    setBusy(row.id);
    setErr(null);
    setMsg(null);
    const r = await updateRecruitmentTargetAdmin(apiAccessToken, row.targetType, {
      isActive: row.isActive,
      title: row.title,
      steps: row.steps,
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Uložení selhalo');
      return;
    }
    setItems(r.items ?? []);
    setMsg(`Uloženo: ${row.label}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/pracovnici-portalu" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Pracovníci portálu
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Náborové cíle</h1>
        <p className="text-sm text-zinc-600">Koho aktuálně hledáme a doporučený scénář komunikace</p>
      </div>

      {msg ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{msg}</p> : null}
      {err ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p> : null}

      <div className="space-y-4">
        {items.map((row) => (
          <section key={row.id} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{row.label}</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.isActive}
                  onChange={(e) => updateLocal(row.id, { isActive: e.target.checked })}
                />
                Aktivní cíl
              </label>
            </div>
            <label className="mt-3 block text-sm">
              Název scénáře
              <input
                value={row.title}
                onChange={(e) => updateLocal(row.id, { title: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm">
              Kroky scénáře (jeden na řádek)
              <textarea
                value={row.steps.join('\n')}
                onChange={(e) =>
                  updateLocal(row.id, {
                    steps: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                  })
                }
                rows={5}
                className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy === row.id}
              onClick={() => void save(row)}
              className="mt-3 rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Uložit
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
