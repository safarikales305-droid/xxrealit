'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminPwaPushCampaignSave,
  nestAdminPwaPushCampaignSend,
  nestAdminPwaPushCampaignsList,
  type PwaPushCampaignRow,
} from '@/lib/nest-client';

const ROLES = [
  'USER', 'AGENT', 'COMPANY', 'AGENCY', 'DEVELOPER', 'PRIVATE_SELLER',
  'CRAFTSMAN', 'TIPSTER', 'FINANCIAL_ADVISOR', 'INVESTOR',
];

export default function AdminPwaPushPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [rows, setRows] = useState<PwaPushCampaignRow[]>([]);
  const [form, setForm] = useState({
    title: '',
    body: '',
    url: '/',
    targetCity: '',
    targetRoles: [] as string[],
    scheduledAt: '',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setRows(await nestAdminPwaPushCampaignsList(token));
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    const r = await nestAdminPwaPushCampaignSave(token, {
      title: form.title,
      body: form.body,
      url: form.url || undefined,
      targetCity: form.targetCity || undefined,
      targetRoles: form.targetRoles,
      scheduledAt: form.scheduledAt || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení se nezdařilo.');
      return;
    }
    setMsg('Kampaň vytvořena.');
    setForm({ title: '', body: '', url: '/', targetCity: '', targetRoles: [], scheduledAt: '' });
    void refresh();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">← Administrace</Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">Marketing — Push notifikace</h1>
      <p className="mt-2 text-sm text-zinc-600">
        PWA push zprávy uživatelům s povolenými notifikacemi. Plánování přes datum a čas.
      </p>

      <ul className="mt-6 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="font-semibold">{row.title}</p>
            <p className="mt-1 text-sm text-zinc-600">{row.body}</p>
            <p className="mt-2 text-xs text-zinc-500">
              {row.status} · odesláno {row.sentCount}
              {row.scheduledAt ? ` · plán ${new Date(row.scheduledAt).toLocaleString('cs-CZ')}` : ''}
            </p>
            {row.status !== 'SENT' ? (
              <button
                type="button"
                className="mt-2 rounded-full bg-[#ff6a00] px-4 py-1.5 text-xs font-semibold text-white"
                onClick={() =>
                  void nestAdminPwaPushCampaignSend(token, row.id).then((r) => {
                    if (r.ok) setMsg(`Odesláno ${r.sent ?? 0} uživatelům.`);
                    void refresh();
                  })
                }
              >
                Odeslat nyní
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <form onSubmit={onCreate} className="mt-8 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Nová push kampaň</h2>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Titulek" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        <textarea className="w-full rounded-lg border px-3 py-2 text-sm" rows={3} placeholder="Text zprávy" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required />
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Odkaz (URL)" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Město (volitelné)" value={form.targetCity} onChange={(e) => setForm((f) => ({ ...f, targetCity: e.target.value }))} />
        <input type="datetime-local" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <label key={r} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={form.targetRoles.includes(r)} onChange={(e) => setForm((f) => ({ ...f, targetRoles: e.target.checked ? [...f.targetRoles, r] : f.targetRoles.filter((x) => x !== r) }))} />
              {r}
            </label>
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        <button type="submit" disabled={busy} className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white">{busy ? 'Ukládám…' : 'Vytvořit kampaň'}</button>
      </form>
    </main>
  );
}
