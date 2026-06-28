'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminMarketingPopupDelete,
  nestAdminMarketingPopupSave,
  nestAdminMarketingPopupToggle,
  nestAdminMarketingPopupsList,
  type MarketingPopupRow,
} from '@/lib/nest-client';

const TRIGGERS = [
  { id: 'AFTER_REGISTER', label: 'Po registraci' },
  { id: 'AFTER_LOGIN', label: 'Po přihlášení' },
  { id: 'MISSING_WHATSAPP', label: 'Chybí WhatsApp' },
  { id: 'MISSING_EMAIL', label: 'Chybí e-mail' },
  { id: 'MISSING_PHONE', label: 'Chybí telefon' },
  { id: 'MISSING_AVATAR', label: 'Chybí profilová fotka' },
  { id: 'MISSING_PROFILE', label: 'Neúplný profil' },
  { id: 'TIPSTER_OFFER', label: 'Nabídka tipaře' },
  { id: 'PWA_INSTALL', label: 'Instalace PWA' },
  { id: 'PWA_PUSH', label: 'PWA push notifikace' },
  { id: 'PORTAL_WORKER_PANEL', label: 'Pracovní panel pracovníka' },
  { id: 'GUEST_SHORTS_GATE', label: 'Guest brána (shorts)' },
  { id: 'GUEST_POSTS_TAB', label: 'Guest — záložka Příspěvky' },
  { id: 'SHARE_GATE', label: 'Share gate video' },
] as const;

const ROLES = [
  'USER',
  'AGENT',
  'COMPANY',
  'AGENCY',
  'DEVELOPER',
  'PRIVATE_SELLER',
  'CRAFTSMAN',
  'TIPSTER',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
  'ADMIN',
  'PORTAL_WORKER',
  'PROPERTY_SEEKER',
];

const VARIANTS = [
  { id: 'modal', label: 'Standardní modal' },
  { id: 'profile_checklist', label: 'Kontrolní seznam profilu' },
  { id: 'worker_checklist', label: 'Onboarding pracovníka' },
  { id: 'pwa_install', label: 'PWA instalace' },
  { id: 'pwa_push', label: 'PWA push' },
  { id: 'guest_gate', label: 'Guest brána' },
  { id: 'inline_overlay', label: 'Inline overlay' },
  { id: 'share_gate', label: 'Share gate' },
];

function emptyForm() {
  return {
    name: '',
    title: '',
    body: '',
    imageUrl: '',
    videoUrl: '',
    linkUrl: '',
    buttonsJson: '[]',
    targetRoles: [] as string[],
    excludeRoles: [] as string[],
    triggers: [] as string[],
    profileTriggers: [] as string[],
    isEnabled: false,
    sortOrder: '0',
    maxViewsPerUser: '1',
    repeatAfterDays: '',
    variant: 'modal',
  };
}

export default function AdminMarketingPopupsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [rows, setRows] = useState<MarketingPopupRow[]>([]);
  const [editing, setEditing] = useState<MarketingPopupRow | null>(null);
  const [form, setForm] = useState(emptyForm());
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
      setForm(emptyForm());
      return;
    }
    setForm({
      name: row.name,
      title: row.title,
      body: row.body,
      imageUrl: row.imageUrl ?? '',
      videoUrl: row.videoUrl ?? '',
      linkUrl: row.linkUrl ?? '',
      buttonsJson: JSON.stringify(row.buttons ?? [], null, 2),
      targetRoles: row.targetRoles ?? [],
      excludeRoles: row.excludeRoles ?? [],
      triggers: row.triggers ?? [],
      profileTriggers: row.profileTriggers ?? [],
      isEnabled: row.isEnabled,
      sortOrder: String(row.sortOrder),
      maxViewsPerUser: String(row.maxViewsPerUser),
      repeatAfterDays: row.repeatAfterDays != null ? String(row.repeatAfterDays) : '',
      variant: row.variant || 'modal',
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
        linkUrl: form.linkUrl || undefined,
        buttons,
        targetRoles: form.targetRoles,
        excludeRoles: form.excludeRoles,
        triggers: form.triggers,
        profileTriggers: form.profileTriggers,
        isEnabled: form.isEnabled,
        sortOrder: Number(form.sortOrder) || 0,
        maxViewsPerUser: Number(form.maxViewsPerUser) || 1,
        repeatAfterDays: form.repeatAfterDays ? Number(form.repeatAfterDays) : null,
        variant: form.variant,
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

  function toggleRole(
    key: 'targetRoles' | 'excludeRoles',
    role: string,
    checked: boolean,
  ) {
    setForm((f) => ({
      ...f,
      [key]: checked ? [...f[key], role] : f[key].filter((x) => x !== role),
    }));
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
        ← Administrace
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">Marketing — Popup okna</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Správa všech popupů, modalů a onboarding oken portálu. Systémové popupy lze upravovat;
        vypnutím se přestanou zobrazovat.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Název</th>
              <th className="px-4 py-3">Trigger</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Vyloučené</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Priorita</th>
              <th className="px-4 py-3">Zobrazení</th>
              <th className="px-4 py-3">Akce</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  Žádné popupy.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-zinc-900">{row.name}</p>
                    {row.isSystem ? (
                      <span className="text-xs text-orange-600">systémový</span>
                    ) : null}
                  </td>
                  <td className="max-w-[140px] px-4 py-3 text-xs text-zinc-600">
                    {row.triggers.join(', ') || '—'}
                  </td>
                  <td className="max-w-[100px] px-4 py-3 text-xs text-zinc-600">
                    {row.targetRoles.length ? row.targetRoles.join(', ') : 'všechny'}
                  </td>
                  <td className="max-w-[120px] px-4 py-3 text-xs text-zinc-600">
                    {row.excludeRoles.length ? row.excludeRoles.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        row.isEnabled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {row.isEnabled ? 'Aktivní' : 'Neaktivní'}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.sortOrder}</td>
                  <td className="px-4 py-3 tabular-nums">{row.displayCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-sm font-medium text-orange-700"
                        onClick={() => loadForm(row)}
                      >
                        Upravit
                      </button>
                      <button
                        type="button"
                        className="text-sm text-zinc-600"
                        onClick={() =>
                          void nestAdminMarketingPopupToggle(token, row.id).then(() => refresh())
                        }
                      >
                        {row.isEnabled ? 'Vypnout' : 'Zapnout'}
                      </button>
                      {!row.isSystem ? (
                        <button
                          type="button"
                          className="text-sm text-red-600"
                          onClick={() =>
                            void nestAdminMarketingPopupDelete(token, row.id).then(() => refresh())
                          }
                        >
                          Smazat
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={onSave} className="mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{editing ? `Upravit: ${editing.name}` : 'Nový popup'}</h2>
          {editing ? (
            <button type="button" className="text-sm text-zinc-500" onClick={() => loadForm(null)}>
              Zrušit úpravu
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Interní název"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={form.variant}
            onChange={(e) => setForm((f) => ({ ...f, variant: e.target.value }))}
          >
            {VARIANTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="Titulek"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
        />
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm"
          rows={4}
          placeholder="Text"
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          required
        />
        <div className="grid gap-4 md:grid-cols-3">
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="URL obrázku"
            value={form.imageUrl}
            onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="URL videa"
            value={form.videoUrl}
            onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Cílový odkaz (hlavní CTA)"
            value={form.linkUrl}
            onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
          />
        </div>
        <textarea
          className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
          rows={3}
          placeholder='Tlačítka JSON [{"label":"...","href":"..."}]'
          value={form.buttonsJson}
          onChange={(e) => setForm((f) => ({ ...f, buttonsJson: e.target.value }))}
        />

        <div>
          <p className="mb-2 text-sm font-medium">Kdy se zobrazí (triggery)</p>
          <div className="flex flex-wrap gap-2">
            {TRIGGERS.map((t) => (
              <label key={t.id} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={form.triggers.includes(t.id)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      triggers: e.target.checked
                        ? [...f.triggers, t.id]
                        : f.triggers.filter((x) => x !== t.id),
                    }))
                  }
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Komu se zobrazí (role, prázdné = všem)</p>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {ROLES.map((r) => (
                <label key={`t-${r}`} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={form.targetRoles.includes(r)}
                    onChange={(e) => toggleRole('targetRoles', r, e.target.checked)}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Komu se nikdy nezobrazí (vyloučené role)</p>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {ROLES.map((r) => (
                <label key={`e-${r}`} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={form.excludeRoles.includes(r)}
                    onChange={(e) => toggleRole('excludeRoles', r, e.target.checked)}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            Priorita (nižší = dříve)
            <input
              type="number"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            Max. zobrazení na uživatele
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={form.maxViewsPerUser}
              onChange={(e) => setForm((f) => ({ ...f, maxViewsPerUser: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            Opakování po X dnech (prázdné = bez opakování)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={form.repeatAfterDays}
              onChange={(e) => setForm((f) => ({ ...f, repeatAfterDays: e.target.value }))}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isEnabled}
            onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))}
          />
          Zapnuto
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white"
        >
          {busy ? 'Ukládám…' : 'Uložit'}
        </button>
      </form>
    </main>
  );
}
