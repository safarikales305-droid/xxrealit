'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestApiConfigured } from '@/lib/nest-client';
import {
  nestAdminApproveProperty,
  nestAdminChangePassword,
  nestAdminImportProperties,
  nestAdminProperties,
  nestAdminStats,
  nestAdminUsers,
  type AdminStats,
  type AdminUserRow,
} from '@/lib/nest-client';

type PropertyRow = {
  id: string;
  title?: string;
  price?: number;
  city?: string;
  location?: string;
  approved?: boolean;
  createdAt?: string;
};

function formatPrice(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoading, logout, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [usersList, setUsersList] = useState<AdminUserRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const [rapidApiKey, setRapidApiKey] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const [s, p, u] = await Promise.all([
      nestAdminStats(token),
      nestAdminProperties(token),
      nestAdminUsers(token),
    ]);
    if (!s || !p || !u) {
      setLoadError(
        'Nepodařilo se načíst data z API. Zkontrolujte přihlášení (Nest JWT), NEXT_PUBLIC_API_URL a roli ADMIN.',
      );
    }
    setStats(s);
    setProperties(
      (p ?? []).filter((x): x is PropertyRow => x != null && typeof x === 'object'),
    );
    setUsersList(u ?? []);
  }, [token]);

  useEffect(() => {
    if (!isLoading && user && user.role !== 'ADMIN') {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      void refresh();
    }
  }, [token, user?.role, refresh]);

  async function onApprove(id: string) {
    if (!token) return;
    setBusyId(id);
    const r = await nestAdminApproveProperty(token, id);
    setBusyId(null);
    if (r.ok) await refresh();
    else setLoadError(r.error ?? 'Schválení selhalo');
  }

  async function onImportRapid(e: React.FormEvent) {
    e.preventDefault();
    setImportSuccess(null);
    setImportError(null);
    if (!token) return;
    const key = rapidApiKey.trim();
    if (!key) {
      setImportError('Zadejte RapidAPI klíč');
      return;
    }
    setImportLoading(true);
    const r = await nestAdminImportProperties(token, key);
    setImportLoading(false);
    if (r.ok) {
      setImportSuccess(`Naimportováno ${r.imported} inzerátů`);
      setRapidApiKey('');
      await refresh();
    } else {
      setImportError(r.error ?? 'Import selhal');
    }
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 8) {
      setPwMsg('Nové heslo musí mít alespoň 8 znaků');
      return;
    }
    if (newPw !== newPw2) {
      setPwMsg('Hesla se neshodují');
      return;
    }
    if (!token) return;
    const r = await nestAdminChangePassword(token, oldPw, newPw);
    if (r.ok) {
      setPwMsg('Heslo bylo změněno.');
      setOldPw('');
      setNewPw('');
      setNewPw2('');
    } else {
      setPwMsg(r.error ?? 'Změna hesla selhala');
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-600">
        Načítání…
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  const apiOk = nestApiConfigured();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-[#e85d00] hover:text-[#ff6a00]"
            >
              XXrealit
            </Link>
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
              Admin
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Prohlížet nemovitosti
            </Link>
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Odhlásit
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        {!apiOk ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Nastavte <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_URL</code> na Nest
            backend a použijte stejný <code className="rounded bg-amber-100 px-1">JWT_SECRET</code>{' '}
            v Next i Nest (kvůli cookie a middleware).
          </p>
        ) : null}

        {loadError ? (
          <p
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {loadError}
          </p>
        ) : null}

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Import inzerátů</h2>
          <p className="mb-4 max-w-2xl text-sm text-zinc-600">
            RapidAPI —{' '}
            <code className="rounded bg-zinc-100 px-1 text-xs">realty-in-us</code> (
            <span className="break-all">list-for-sale</span>, výchozí Houston TX). Klíč se
            neukládá; použije se jen pro jeden požadavek. Inzeráty se uloží pod vaším admin
            účtem jako schválené.
          </p>
          <form
            onSubmit={(e) => void onImportRapid(e)}
            className="max-w-xl space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label htmlFor="rapidKey" className="mb-1 block text-sm font-medium text-zinc-700">
                RapidAPI klíč
              </label>
              <input
                id="rapidKey"
                type="password"
                autoComplete="off"
                value={rapidApiKey}
                onChange={(e) => setRapidApiKey(e.target.value)}
                placeholder="X-RapidAPI-Key"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15"
              />
            </div>
            {importError ? (
              <p className="text-sm font-medium text-red-600" role="alert">
                {importError}
              </p>
            ) : null}
            {importSuccess ? (
              <p className="text-sm font-medium text-emerald-700" role="status">
                {importSuccess}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={importLoading || !apiOk}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {importLoading ? (
                <span
                  className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
              ) : null}
              {importLoading ? 'Importuji…' : 'Importovat'}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Statistiky</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Uživatelé (USER)
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-900">
                {stats?.users ?? '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Administrátoři
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-900">
                {stats?.admins ?? '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Celkem účtů
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-900">
                {stats?.total ?? '—'}
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Inzeráty</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {properties.length === 0 ? (
              <p className="text-sm text-zinc-500">Žádné inzeráty nebo se nepodařilo načíst.</p>
            ) : (
              properties.map((prop) => {
                const loc = prop.city ?? prop.location ?? '—';
                const approved = prop.approved !== false;
                return (
                  <article
                    key={prop.id}
                    className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-semibold text-zinc-900">{prop.title ?? prop.id}</h3>
                        {!approved ? (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            Ke schválení
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Schváleno
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-600">
                        {loc} · {formatPrice(prop.price)}
                      </p>
                    </div>
                    {!approved ? (
                      <button
                        type="button"
                        disabled={busyId === prop.id}
                        onClick={() => void onApprove(prop.id)}
                        className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
                      >
                        {busyId === prop.id ? 'Schvaluji…' : 'Schválit'}
                      </button>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Uživatelé</h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Registrace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50/80">
                    <td className="px-4 py-3 font-medium text-zinc-900">{u.email}</td>
                    <td className="px-4 py-3 text-zinc-600">{u.role}</td>
                    <td className="hidden px-4 py-3 text-zinc-500 sm:table-cell">
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString('cs-CZ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usersList.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">Žádní uživatelé.</p>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Změna hesla administrátora</h2>
          <form
            onSubmit={onPasswordSubmit}
            className="max-w-md space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label htmlFor="oldPw" className="mb-1 block text-sm font-medium text-zinc-700">
                Současné heslo
              </label>
              <input
                id="oldPw"
                type="password"
                autoComplete="current-password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15"
              />
            </div>
            <div>
              <label htmlFor="newPw" className="mb-1 block text-sm font-medium text-zinc-700">
                Nové heslo
              </label>
              <input
                id="newPw"
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15"
              />
            </div>
            <div>
              <label htmlFor="newPw2" className="mb-1 block text-sm font-medium text-zinc-700">
                Potvrdit nové heslo
              </label>
              <input
                id="newPw2"
                type="password"
                autoComplete="new-password"
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15"
              />
            </div>
            {pwMsg ? (
              <p
                className={
                  pwMsg.includes('změněno')
                    ? 'text-sm font-medium text-emerald-700'
                    : 'text-sm font-medium text-red-600'
                }
                role="status"
              >
                {pwMsg}
              </p>
            ) : null}
            <button
              type="submit"
              className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Uložit nové heslo
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
