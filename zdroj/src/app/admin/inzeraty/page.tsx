'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminApproveProperty,
  nestAdminDeleteProperty,
  nestAdminListings,
  nestAdminUpdateProperty,
  nestApiConfigured,
  type AdminListingRow,
} from '@/lib/nest-client';

const STATUS_OPTIONS = [
  { value: '', label: 'Všechny stavy' },
  { value: 'ACTIVE', label: 'Aktivní (veřejně)' },
  { value: 'PENDING_APPROVAL', label: 'Čeká na schválení' },
  { value: 'INACTIVE', label: 'Neaktivní / skrytý' },
  { value: 'EXPIRED', label: 'Expirovaný' },
  { value: 'SCHEDULED', label: 'Naplánovaný' },
  { value: 'DELETED', label: 'Smazaný (soft)' },
] as const;

const TYPE_OPTIONS = [
  { value: '', label: 'Všechny typy' },
  { value: 'SHORTS', label: 'Shorts' },
  { value: 'CLASSIC', label: 'Klasik' },
] as const;

function formatPrice(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

function statusBadgeClass(status: string | undefined): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-900';
    case 'PENDING_APPROVAL':
      return 'bg-amber-100 text-amber-900';
    case 'INACTIVE':
      return 'bg-zinc-200 text-zinc-800';
    case 'EXPIRED':
      return 'bg-rose-100 text-rose-900';
    case 'SCHEDULED':
      return 'bg-sky-100 text-sky-900';
    case 'DELETED':
      return 'bg-red-100 text-red-900';
    default:
      return 'bg-zinc-100 text-zinc-700';
  }
}

function toInputLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminListingsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [rows, setRows] = useState<AdminListingRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [listingType, setListingType] = useState('');
  const [status, setStatus] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');

  const [editRow, setEditRow] = useState<AdminListingRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImagesRaw, setEditImagesRaw] = useState('');
  const [editActiveFrom, setEditActiveFrom] = useState('');
  const [editActiveUntil, setEditActiveUntil] = useState('');
  const [editListingType, setEditListingType] = useState<'SHORTS' | 'CLASSIC'>('CLASSIC');
  const [editApproved, setEditApproved] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editViewsCount, setEditViewsCount] = useState('0');
  const [editAutoViewsEnabled, setEditAutoViewsEnabled] = useState(false);
  const [editAutoViewsIncrement, setEditAutoViewsIncrement] = useState('100');
  const [editAutoViewsIntervalMinutes, setEditAutoViewsIntervalMinutes] = useState('1');
  const [editImportDisabled, setEditImportDisabled] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const list = await nestAdminListings(token, {
      search: search.trim() || undefined,
      listingType: listingType || undefined,
      status: status || undefined,
      userId: filterUserId.trim() || undefined,
      city: filterCity.trim() || undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
    });
    if (!list) {
      setLoadError('Nepodařilo se načíst inzeráty (zkontrolujte token a API).');
      setRows([]);
      return;
    }
    setRows(list);
  }, [
    token,
    search,
    listingType,
    status,
    filterUserId,
    filterCity,
    createdFrom,
    createdTo,
  ]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      void refresh();
    }
  }, [token, user?.role, refresh]);

  function openEdit(r: AdminListingRow) {
    setEditRow(r);
    setEditTitle((r.title ?? '').trim());
    setEditPrice(String(r.price ?? ''));
    setEditCity((r.city ?? r.location ?? '').trim());
    setEditDescription(String(r.description ?? '').trim());
    setEditImagesRaw(Array.isArray(r.images) ? r.images.join('\n') : '');
    setEditActiveFrom(toInputLocal(r.activeFrom));
    setEditActiveUntil(toInputLocal(r.activeUntil));
    setEditListingType(r.listingType === 'SHORTS' ? 'SHORTS' : 'CLASSIC');
    setEditApproved(Boolean(r.approved));
    setEditIsActive(r.isActive !== false);
    setEditViewsCount(String(Math.max(0, Math.trunc(r.viewsCount ?? 0))));
    setEditAutoViewsEnabled(Boolean(r.autoViewsEnabled));
    setEditAutoViewsIncrement(String(Math.max(1, Math.trunc(r.autoViewsIncrement ?? 100))));
    setEditAutoViewsIntervalMinutes(String(Math.max(1, Math.trunc(r.autoViewsIntervalMinutes ?? 1))));
    setEditImportDisabled(Boolean(r.importDisabled));
    setEditMsg(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editRow) return;
    setEditMsg(null);
    const priceNum = Number.parseInt(editPrice.replace(/\s/g, ''), 10);
    const viewsNum = Number.parseInt(editViewsCount.replace(/\s/g, ''), 10);
    const autoIncNum = Number.parseInt(editAutoViewsIncrement.replace(/\s/g, ''), 10);
    const autoIntNum = Number.parseInt(editAutoViewsIntervalMinutes.replace(/\s/g, ''), 10);
    if (!Number.isFinite(viewsNum) || viewsNum < 0) {
      setEditMsg('Počet shlédnutí musí být 0 nebo vyšší.');
      return;
    }
    if (!Number.isFinite(autoIncNum) || autoIncNum <= 0) {
      setEditMsg('Auto increment musí být > 0.');
      return;
    }
    if (!Number.isFinite(autoIntNum) || autoIntNum <= 0) {
      setEditMsg('Auto interval musí být > 0 minut.');
      return;
    }
    const body: Record<string, unknown> = {
      title: editTitle.trim(),
      price: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : undefined,
      city: editCity.trim(),
      description: editDescription.trim(),
      listingType: editListingType,
      approved: editApproved,
      isActive: editIsActive,
      importDisabled: editImportDisabled,
      viewsCount: viewsNum,
      autoViewsEnabled: editAutoViewsEnabled,
      autoViewsIncrement: autoIncNum,
      autoViewsIntervalMinutes: autoIntNum,
      images: editImagesRaw
        .split('\n')
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    };
    if (editActiveFrom.trim()) {
      body.activeFrom = new Date(editActiveFrom).toISOString();
    } else {
      body.activeFrom = '';
    }
    if (editActiveUntil.trim()) {
      body.activeUntil = new Date(editActiveUntil).toISOString();
    } else {
      body.activeUntil = '';
    }
    setBusyId(editRow.id);
    const r = await nestAdminUpdateProperty(token, editRow.id, body);
    setBusyId(null);
    if (r.ok) {
      setEditRow(null);
      await refresh();
    } else {
      setEditMsg(r.error ?? 'Uložení selhalo');
    }
  }

  async function onApprove(id: string) {
    if (!token) return;
    setBusyId(id);
    const r = await nestAdminApproveProperty(token, id);
    setBusyId(null);
    if (r.ok) await refresh();
    else setLoadError(r.error ?? 'Schválení selhalo');
  }

  async function onSoftDelete(id: string) {
    if (!token) return;
    if (
      !window.confirm(
        'Opravdu smazat inzerát? Bude skrytý (soft delete) a zmizí z veřejného výpisu.',
      )
    ) {
      return;
    }
    setBusyId(id);
    const r = await nestAdminDeleteProperty(token, id);
    setBusyId(null);
    if (r.ok) await refresh();
    else setLoadError(r.error ?? 'Smazání selhalo');
  }

  async function quickSetActive(id: string, isActive: boolean) {
    if (!token) return;
    setBusyId(id);
    const r = await nestAdminUpdateProperty(token, id, { isActive });
    setBusyId(null);
    if (r.ok) await refresh();
    else setLoadError(r.error ?? 'Změna stavu selhala');
  }

  async function onRestore(id: string) {
    if (!token) return;
    setBusyId(id);
    const r = await nestAdminUpdateProperty(token, id, { restore: true });
    setBusyId(null);
    if (r.ok) await refresh();
    else setLoadError(r.error ?? 'Obnova selhala');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-600">
        Načítání…
      </div>
    );
  }

  if (!token || !user || user.role !== 'ADMIN') {
    return null;
  }

  const apiOk = nestApiConfigured();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-[#e85d00] hover:text-[#ff6a00]"
            >
              XXrealit
            </Link>
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
              Admin — Inzeráty
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Přehled admin
            </Link>
            <Link
              href="/admin/hudba"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Hudba
            </Link>
            <Link
              href="/admin/importy"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Importy
            </Link>
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">
              Web
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-8">
        {!apiOk ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Nastavte <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_URL</code> na Nest API.
          </p>
        ) : null}

        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Všechny inzeráty</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Správa všech nemovitostí včetně shorts a klasiku. Veřejně se zobrazují jen aktivní,
            schválené a v časovém okně.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Hledat (název / město)</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Název nebo lokalita…"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Typ</label>
              <select
                value={listingType}
                onChange={(e) => setListingType(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Stav</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">ID autora</label>
              <input
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                placeholder="UUID uživatele"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono text-xs outline-none focus:border-[#ff6a00]/55"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Lokalita (filtr)</label>
              <input
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Vytvořeno od</label>
              <input
                type="date"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Vytvořeno do</label>
              <input
                type="date"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void refresh()}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Filtrovat
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-3">Název</th>
                <th className="px-3 py-3">Typ</th>
                <th className="px-3 py-3">Autor</th>
                <th className="px-3 py-3">Město</th>
                <th className="px-3 py-3">Cena</th>
                <th className="px-3 py-3">Zdroj</th>
                <th className="px-3 py-3">Vytvořeno</th>
                <th className="px-3 py-3">Views</th>
                <th className="px-3 py-3">Stav</th>
                <th className="px-3 py-3">Aktivní od / do</th>
                <th className="px-3 py-3 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-zinc-500">
                    Žádné záznamy. Upravte filtry nebo zkuste znovu načíst.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const pending = r.listingStatus === 'PENDING_APPROVAL';
                  const deleted = Boolean(r.deletedAt);
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50/80">
                      <td className="max-w-[200px] px-3 py-2">
                        <Link
                          href={`/nemovitost/${r.id}`}
                          className="line-clamp-2 font-medium text-[#e85d00] hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.title ?? r.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium">
                          {r.listingType === 'SHORTS' ? 'Shorts' : 'Klasik'}
                        </span>
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-xs text-zinc-600" title={r.authorEmail}>
                        {r.authorEmail ?? r.userId ?? '—'}
                      </td>
                      <td className="px-3 py-2">{r.city ?? r.location ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{formatPrice(r.price)}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        {r.importSource ? `${r.importSource}/${r.importMethod ?? '-'}` : 'Lokální'}
                        {r.importExternalId ? <div className="font-mono text-[10px]">{r.importExternalId}</div> : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-600">
                        {formatDt(r.createdAt)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold tabular-nums text-zinc-900">
                        {Math.max(0, Math.trunc(r.viewsCount ?? 0)).toLocaleString('cs-CZ')}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(r.listingStatus)}`}
                        >
                          {r.listingStatus ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        <div>{formatDt(r.activeFrom)}</div>
                        <div>{formatDt(r.activeUntil)}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            disabled={busyId === r.id}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                          >
                            Upravit
                          </button>
                          {pending ? (
                            <button
                              type="button"
                              onClick={() => void onApprove(r.id)}
                              disabled={busyId === r.id}
                              className="rounded-md bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Schválit
                            </button>
                          ) : null}
                          {!deleted && r.isActive !== false ? (
                            <button
                              type="button"
                              onClick={() => void quickSetActive(r.id, false)}
                              disabled={busyId === r.id}
                              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 disabled:opacity-50"
                            >
                              Deaktivovat
                            </button>
                          ) : null}
                          {!deleted && r.isActive === false ? (
                            <button
                              type="button"
                              onClick={() => void quickSetActive(r.id, true)}
                              disabled={busyId === r.id}
                              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900 disabled:opacity-50"
                            >
                              Aktivovat
                            </button>
                          ) : null}
                          {deleted ? (
                            <button
                              type="button"
                              onClick={() => void onRestore(r.id)}
                              disabled={busyId === r.id}
                              className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-900 disabled:opacity-50"
                            >
                              Obnovit
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onSoftDelete(r.id)}
                              disabled={busyId === r.id}
                              className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Smazat
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </main>

      {editRow ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="edit-listing-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 id="edit-listing-title" className="text-lg font-semibold">
              Upravit inzerát
            </h2>
            <p className="mt-1 text-xs text-zinc-500">{editRow.id}</p>
            <form onSubmit={(e) => void saveEdit(e)} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Název</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Cena (Kč)</label>
                  <input
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Město</label>
                  <input
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Popis</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Fotky (URL, každý řádek)</label>
                <textarea
                  value={editImagesRaw}
                  onChange={(e) => setEditImagesRaw(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-mono outline-none focus:border-[#ff6a00]/55"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Typ inzerátu</label>
                <select
                  value={editListingType}
                  onChange={(e) => setEditListingType(e.target.value as 'SHORTS' | 'CLASSIC')}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                >
                  <option value="CLASSIC">Klasik</option>
                  <option value="SHORTS">Shorts</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editApproved}
                    onChange={(e) => setEditApproved(e.target.checked)}
                  />
                  Schváleno
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                  />
                  Aktivní (veřejně zapnuto)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editImportDisabled}
                    onChange={(e) => setEditImportDisabled(e.target.checked)}
                  />
                  Ručně vypnuto pro import sync
                </label>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Views systém
                </p>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="text-sm font-medium text-zinc-700">
                    Počáteční / aktuální views
                    <input
                      value={editViewsCount}
                      onChange={(e) => setEditViewsCount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                      inputMode="numeric"
                    />
                  </label>
                  <label className="text-sm font-medium text-zinc-700">
                    Auto +views
                    <input
                      value={editAutoViewsIncrement}
                      onChange={(e) => setEditAutoViewsIncrement(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                      inputMode="numeric"
                    />
                  </label>
                  <label className="text-sm font-medium text-zinc-700">
                    Interval (min)
                    <input
                      value={editAutoViewsIntervalMinutes}
                      onChange={(e) => setEditAutoViewsIntervalMinutes(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[100, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditViewsCount(String(preset))}
                      className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                    >
                      {preset.toLocaleString('cs-CZ')}
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm font-medium text-zinc-800">
                  <input
                    type="checkbox"
                    checked={editAutoViewsEnabled}
                    onChange={(e) => setEditAutoViewsEnabled(e.target.checked)}
                  />
                  Zapnout autopilota views
                </label>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Aktivní od</label>
                <input
                  type="datetime-local"
                  value={editActiveFrom}
                  onChange={(e) => setEditActiveFrom(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                />
                <p className="mt-1 text-xs text-zinc-500">Prázdné = bez omezení od data</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Aktivní do</label>
                <input
                  type="datetime-local"
                  value={editActiveUntil}
                  onChange={(e) => setEditActiveUntil(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#ff6a00]/55"
                />
                <p className="mt-1 text-xs text-zinc-500">Prázdné = bez konce; v minulosti = expirovaný</p>
              </div>
              {editMsg ? (
                <p className="text-sm font-medium text-red-600" role="alert">
                  {editMsg}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditRow(null)}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={busyId === editRow.id}
                  className="rounded-lg bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busyId === editRow.id ? 'Ukládám…' : 'Uložit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
