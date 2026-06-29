'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminListPortalWorkers, type PortalWorkerRow } from '@/lib/nest-client';
import {
  createRecruitmentTargetAdmin,
  deleteRecruitmentTargetAdmin,
  fetchRecruitmentTargetsAdmin,
  hasApiError,
  sendRecruitmentTargetToWorkers,
  updateRecruitmentTargetAdmin,
  type RecruitmentTargetRow,
} from '@/lib/portal-worker-communication-api';

const EMPTY_FORM = {
  name: '',
  description: '',
  workerNote: '',
  sortOrder: '100',
  steps: '',
  isActive: false,
};

export default function AdminRecruitmentTargetsPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [items, setItems] = useState<RecruitmentTargetRow[]>([]);
  const [workers, setWorkers] = useState<PortalWorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [sendTargetId, setSendTargetId] = useState<string | null>(null);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [targets, workerList] = await Promise.all([
      fetchRecruitmentTargetsAdmin(apiAccessToken),
      nestAdminListPortalWorkers(apiAccessToken),
    ]);
    setItems(targets.items);
    setWorkers(workerList.items);
    if (hasApiError(targets)) {
      setErr(targets.error);
    } else if (hasApiError(workerList)) {
      setErr(workerList.error);
    }
    setLoading(false);
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
    const r = await updateRecruitmentTargetAdmin(apiAccessToken, row.id, {
      isActive: row.isActive,
      name: row.name,
      title: row.title,
      description: row.description,
      workerNote: row.workerNote,
      sortOrder: row.sortOrder,
      steps: row.steps,
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Uložení selhalo');
      return;
    }
    setItems(r.items ?? []);
    setMsg(`Uloženo: ${row.name}`);
  }

  async function createTarget() {
    setBusy('create');
    setErr(null);
    const r = await createRecruitmentTargetAdmin(apiAccessToken, {
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      workerNote: createForm.workerNote.trim(),
      sortOrder: Number(createForm.sortOrder) || 100,
      isActive: createForm.isActive,
      steps: createForm.steps.split('\n').map((s) => s.trim()).filter(Boolean),
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Vytvoření selhalo');
      return;
    }
    setShowCreate(false);
    setCreateForm(EMPTY_FORM);
    await load();
    setMsg('Náborový cíl vytvořen.');
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Smazat náborový cíl „${name}"?`)) return;
    setBusy(id);
    const r = await deleteRecruitmentTargetAdmin(apiAccessToken, id);
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Smazání selhalo');
      return;
    }
    await load();
    setMsg('Náborový cíl smazán.');
  }

  async function sendToWorkers() {
    if (!sendTargetId || selectedWorkers.length === 0) return;
    setBusy('send');
    const r = await sendRecruitmentTargetToWorkers(apiAccessToken, sendTargetId, selectedWorkers);
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Odeslání selhalo');
      return;
    }
    setSendTargetId(null);
    setSelectedWorkers([]);
    setMsg(`Odesláno ${r.recipientCount} pracovníkům (e-mailů: ${r.emailsSent}, chyb: ${r.emailErrors}).`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/pracovnici-portalu" className="text-sm font-semibold text-[#e85d00] hover:underline">
            ← Pracovníci portálu
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Náborové cíle</h1>
          <p className="text-sm text-zinc-600">Správa cílových skupin a odeslání pracovníkům</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
        >
          + Nový cíl
        </button>
      </div>

      {msg ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{msg}</p> : null}
      {err ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p> : null}
      {loading ? <p className="text-sm text-zinc-600">Načítám náborové cíle…</p> : null}

      {!loading && items.length === 0 ? (
        <p className="text-sm text-zinc-500">Žádné náborové cíle. Zkontrolujte připojení k API nebo spusťte migraci databáze.</p>
      ) : null}

      <div className="space-y-4">
        {items.map((row) => (
          <section key={row.id} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{row.name || row.label}</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.isActive}
                    onChange={(e) => updateLocal(row.id, { isActive: e.target.checked })}
                  />
                  Aktivní
                </label>
                <label>
                  Priorita
                  <input
                    type="number"
                    value={row.sortOrder}
                    onChange={(e) => updateLocal(row.id, { sortOrder: Number(e.target.value) || 0 })}
                    className="ml-2 w-16 rounded border px-2 py-1"
                  />
                </label>
              </div>
            </div>

            <label className="mt-3 block text-sm">
              Název cílové skupiny
              <input
                value={row.name}
                onChange={(e) => updateLocal(row.id, { name: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm">
              Popis
              <textarea
                value={row.description}
                onChange={(e) => updateLocal(row.id, { description: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm">
              Doporučený scénář oslovení (jeden krok na řádek)
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
            <label className="mt-3 block text-sm">
              Poznámka pro pracovníka
              <textarea
                value={row.workerNote}
                onChange={(e) => updateLocal(row.id, { workerNote: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => void save(row)}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Uložit
              </button>
              <button
                type="button"
                onClick={() => {
                  setSendTargetId(row.id);
                  setSelectedWorkers([]);
                }}
                className="rounded-lg border border-[#e85d00] px-4 py-2 text-sm font-semibold text-[#e85d00]"
              >
                Odeslat pracovníkům
              </button>
              {row.isCustom ? (
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => void remove(row.id, row.name)}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700"
                >
                  Smazat
                </button>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold">Nový náborový cíl</h2>
            <div className="mt-4 space-y-3">
              <input
                placeholder="Název cílové skupiny"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Popis"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Scénář (jeden krok na řádek)"
                value={createForm.steps}
                onChange={(e) => setCreateForm({ ...createForm, steps: e.target.value })}
                rows={4}
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border px-4 py-2 text-sm">
                Zrušit
              </button>
              <button
                type="button"
                disabled={busy === 'create' || !createForm.name.trim()}
                onClick={() => void createTarget()}
                className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Vytvořit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sendTargetId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold">Odeslat pracovníkům</h2>
            <p className="mt-1 text-sm text-zinc-600">Vyberte jednoho nebo více pracovníků.</p>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {workers.map((w) => (
                <label key={w.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedWorkers.includes(w.id)}
                    onChange={(e) => {
                      setSelectedWorkers((prev) =>
                        e.target.checked ? [...prev, w.id] : prev.filter((id) => id !== w.id),
                      );
                    }}
                  />
                  {w.name} · {w.email}
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSendTargetId(null)} className="rounded-lg border px-4 py-2 text-sm">
                Zrušit
              </button>
              <button
                type="button"
                disabled={busy === 'send' || selectedWorkers.length === 0}
                onClick={() => void sendToWorkers()}
                className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Odeslat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
