'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestAdminPromoProfileCreate,
  nestAdminPromoProfileGenerateName,
  nestAdminPromoProfilesBulk,
  nestAdminPromoProfilesList,
  type AdminPromoProfileRow,
} from '@/lib/nest-client';

const PROMO_ROLE_OPTIONS = [
  { value: 'AGENT', label: 'Makléř' },
  { value: 'INVESTOR', label: 'Investor' },
  { value: 'COMPANY', label: 'Stavební firma' },
  { value: 'FINANCIAL_ADVISOR', label: 'Finanční poradce' },
  { value: 'CRAFTSMAN', label: 'Řemeslník' },
  { value: 'AGENCY', label: 'RK' },
] as const;

export default function AdminPromoProfilyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [rows, setRows] = useState<AdminPromoProfileRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<string>('AGENT');
  const [isPublic, setIsPublic] = useState(true);
  const [active, setActive] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const list = await nestAdminPromoProfilesList(token);
    if (!list) {
      setLoadError('Nepodařilo se načíst promo profily.');
      return;
    }
    setLoadError(null);
    setRows(list);
  }, [token]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/');
      return;
    }
    void refresh();
  }, [isLoading, user, router, refresh]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected],
  );

  async function onGenerateName() {
    if (!token) return;
    const generated = await nestAdminPromoProfileGenerateName(token);
    if (!generated) {
      setActionError('Generování jména selhalo.');
      return;
    }
    setFirstName(generated.firstName);
    setLastName(generated.lastName);
    setActionError(null);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!photoFile) {
      setActionError('Nahrajte profilovou fotku.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setActionError('Vyplňte jméno a příjmení.');
      return;
    }
    setSaving(true);
    setActionError(null);
    const form = new FormData();
    form.append('file', photoFile);
    form.append('firstName', firstName.trim());
    form.append('lastName', lastName.trim());
    form.append('role', role);
    form.append('isPublic', String(isPublic));
    form.append('active', String(active));
    const result = await nestAdminPromoProfileCreate(token, form);
    setSaving(false);
    if (!result.ok) {
      setActionError(result.error ?? 'Uložení selhalo.');
      return;
    }
    setFirstName('');
    setLastName('');
    setPhotoFile(null);
    if (fileRef.current) fileRef.current.value = '';
    await refresh();
  }

  async function onBulk(action: 'publish' | 'hide' | 'deactivate' | 'delete') {
    if (!token || selected.size === 0) return;
    if (action === 'delete') {
      const ok = window.confirm(`Smazat ${selected.size} vybraných promo profilů?`);
      if (!ok) return;
    }
    setActionError(null);
    const result = await nestAdminPromoProfilesBulk(token, [...selected], action);
    if (!result.ok) {
      setActionError(result.error ?? 'Hromadná akce selhala.');
      return;
    }
    setSelected(new Set());
    await refresh();
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r.id)));
  }

  if (isLoading || !user) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-zinc-500">Načítám…</main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Promo profily</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Rychlá tvorba profilů pro zaplnění portálu. Veřejně se zobrazují jen aktivní a
            zveřejněné.
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
        >
          ← Admin
        </Link>
      </div>

      <form
        onSubmit={onCreate}
        className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-bold text-zinc-900">Rychlá tvorba</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Profilová fotka
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview}
                alt=""
                className="mt-2 size-20 rounded-full border object-cover"
              />
            ) : null}
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jméno"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Příjmení"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void onGenerateName()}
              className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
            >
              Vygenerovat jméno
            </button>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              {PROMO_ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Veřejný profil
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Aktivní
            </label>
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Ukládám…' : 'Uložit profil'}
        </button>
        {actionError ? <p className="mt-3 text-sm text-red-600">{actionError}</p> : null}
      </form>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => void onBulk('publish')}
          className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Zveřejnit vybrané
        </button>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => void onBulk('hide')}
          className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Skrýt vybrané
        </button>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => void onBulk('deactivate')}
          className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Vypnout vybrané
        </button>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => void onBulk('delete')}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
        >
          Smazat vybrané
        </button>
      </div>

      {loadError ? <p className="mb-4 text-sm text-red-600">{loadError}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="px-3 py-3">Foto</th>
              <th className="px-3 py-3">Jméno</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Stav</th>
              <th className="px-3 py-3">Profil</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const avatar = row.avatarUrl ? nestAbsoluteAssetUrl(row.avatarUrl) : null;
              return (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="size-10 rounded-full object-cover" />
                    ) : (
                      <div className="size-10 rounded-full bg-zinc-100" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-zinc-500">
                      {row.firstName} {row.lastName}
                    </p>
                  </td>
                  <td className="px-3 py-3">{row.roleLabel}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
                        Promo profil
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.isPublic
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-zinc-200 text-zinc-700'
                        }`}
                      >
                        {row.isPublic ? 'Veřejný' : 'Neveřejný'}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.active
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {row.active ? 'Aktivní' : 'Vypnutý'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/profile/${row.id}`}
                      className="text-orange-600 hover:underline"
                      target="_blank"
                    >
                      Otevřít
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">Zatím žádné promo profily.</p>
        ) : null}
      </div>
    </main>
  );
}
