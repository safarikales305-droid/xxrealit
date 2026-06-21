'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminMarketingPopupDelete,
  nestAdminMarketingPopupSave,
  nestAdminMarketingPopupsList,
  type MarketingPopupRow,
} from '@/lib/nest-client';

const TRIGGERS = [
  { id: 'AFTER_REGISTER', label: 'Po registraci' },
  { id: 'AFTER_LOGIN', label: 'Po přihlášení' },
  { id: 'MISSING_WHATSAPP', label: 'Chybí WhatsApp' },
  { id: 'MISSING_EMAIL', label: 'Chybí e-mail' },
  { id: 'MISSING_PROFILE', label: 'Neúplný profil' },
  { id: 'TIPSTER_OFFER', label: 'Nabídka tipaře' },
  { id: 'PWA_INSTALL', label: 'Instalace PWA' },
] as const;

const ROLES = [
  'USER', 'AGENT', 'COMPANY', 'AGENCY', 'DEVELOPER', 'PRIVATE_SELLER',
  'CRAFTSMAN', 'TIPSTER', 'FINANCIAL_ADVISOR', 'INVESTOR',
];

export default function AdminMarketingPopupsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [rows, setRows] = useState<MarketingPopupRow[]>([]);
  const [editing, setEditing] = useState<MarketingPopupRow | null>(null);
  const [form, setForm] = useState({
    name: '',
    title: '',
    body: '',
    imageUrl: '',
    videoUrl: '',
    buttonsJson: '[]',
    targetRoles: [] as string[],
    triggers: [] as string[],
    isEnabled: false,
    sortOrder: '0',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setRows(await nestAdminMarketingPopupsList(token));
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function loadForm(row: MarketingPopupRow | null) {
    setEditing(row);
    if (!row) {
      setForm({
        name: '',
        title: '',
        body: '',
        imageUrl: '',
        videoUrl: '',
        buttonsJson: '[]',
        targetRoles: [],
        triggers: [],
        isEnabled: false,
        sortOrder: '0',
      });
      return;
    }
    setForm({
      name: row.name,
      title: row.title,
      body: row.body,
      imageUrl: row.imageUrl ?? '',
      videoUrl: row.videoUrl ?? '',
      buttonsJson: JSON.stringify(row.buttons ?? [], null, 2),
      targetRoles: row.targetRoles ?? [],
      triggers: row.triggers ?? [],
      isEnabled: row.isEnabled,
      sortOrder: String(row.sortOrder),
    });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    let buttons: Array<{ label: string; href: string }> = [];
    try {
      buttons = JSON.parse(form.buttonsJson) as Array<{ label: string; href: string }>;
    } catch {
      setBusy(false);
      setError('Tlačítka musí být platné JSON pole [{label, href}].');
      return;
    }
    const r = await nestAdminMarketingPopupSave(
      token,
      {
        name: form.name,
        title: form.title,
        body: form.body,
        imageUrl: form.imageUrl || undefined,
        videoUrl: form.videoUrl || undefined,
        buttons,
        targetRoles: form.targetRoles,
        triggers: form.triggers,
        isEnabled: form.isEnabled,
        sortOrder: Number(form.sortOrder) || 0,
      },
      editing?.id,
    );
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení se nezdařilo.');
      return;
    }
    setMsg('Popup uložen.');
    loadForm(null);
    void refresh();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">← Administrace</Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">Marketing — Popup okna</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Vlastní popupy podle role a triggeru. Vestavěný onboarding profilu se zobrazuje automaticky.
      </p>

      <ul className="mt-6 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3">
            <div>
              <p className="font-semibold text-zinc-900">{row.name}</p>
              <p className="text-xs text-zinc-500">{row.triggers.join(', ') || 'bez triggeru'}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="text-sm text-orange-700" onClick={() => loadForm(row)}>Upravit</button>
              <button
                type="button"
                className="text-sm text-red-600"
                onClick={() => void nestAdminMarketingPopupDelete(token, row.id).then(() => refresh())}
              >
                Smazat
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={onSave} className="mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">{editing ? 'Upravit popup' : 'Nový popup'}</h2>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Interní název" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Titulek" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        <textarea className="w-full rounded-lg border px-3 py-2 text-sm" rows={4} placeholder="Text" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required />
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="URL obrázku" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} />
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="URL videa" value={form.videoUrl} onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))} />
        <textarea className="w-full rounded-lg border px-3 py-2 font-mono text-xs" rows={3} placeholder='Tlačítka JSON' value={form.buttonsJson} onChange={(e) => setForm((f) => ({ ...f, buttonsJson: e.target.value }))} />
        <div>
          <p className="mb-2 text-sm font-medium">Triggery</p>
          <div className="flex flex-wrap gap-2">
            {TRIGGERS.map((t) => (
              <label key={t.id} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={form.triggers.includes(t.id)} onChange={(e) => setForm((f) => ({ ...f, triggers: e.target.checked ? [...f.triggers, t.id] : f.triggers.filter((x) => x !== t.id) }))} />
                {t.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Role (prázdné = všechny)</p>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={form.targetRoles.includes(r)} onChange={(e) => setForm((f) => ({ ...f, targetRoles: e.target.checked ? [...f.targetRoles, r] : f.targetRoles.filter((x) => x !== r) }))} />
                {r}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isEnabled} onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))} />
          Zapnuto
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        <button type="submit" disabled={busy} className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white">{busy ? 'Ukládám…' : 'Uložit'}</button>
      </form>
    </main>
  );
}
