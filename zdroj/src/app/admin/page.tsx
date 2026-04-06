'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getClientTokenFromCookie } from '@/lib/api';
import { nestApiConfigured } from '@/lib/nest-client';
import {
  nestAdminApproveProperty,
  nestAdminChangePassword,
  nestAdminDeleteUser,
  nestAdminDeleteProperty,
  nestAdminImportProperties,
  nestAdminPendingProperties,
  nestAdminStats,
  nestAdminUpdateUserRole,
  nestAdminUsers,
  type AdminStats,
  type AdminUserRow,
} from '@/lib/nest-client';

const ROLE_OPTIONS = [
  'USER',
  'AGENT',
  'DEVELOPER',
  'PRIVATE_SELLER',
  'ADMIN',
] as const;

type PropertyRow = {
  id: string;
  title?: string;
  price?: number;
  city?: string;
  location?: string;
  approved?: boolean;
  createdAt?: string;
};

function StatCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900">{value}</p>
    </div>
  );
}

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
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

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
      nestAdminPendingProperties(token),
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
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      void refresh();
    }
  }, [token, user?.role, refresh]);

  useEffect(() => {
    const stored = getClientTokenFromCookie();
    console.log('TOKEN:', stored);
  }, []);

  async function onApprove(id: string) {
    if (!token) return;
    setBusyId(id);
    const r = await nestAdminApproveProperty(token, id);
    setBusyId(null);
    if (r.ok) await refresh();
    else setLoadError(r.error ?? 'Schválení selhalo');
  }

  async function onDeleteProperty(id: string) {
    if (!token) return;
    if (!window.confirm('Opravdu smazat inzerát? Tato akce je nevratná.')) {
      return;
    }
    setBusyId(id);
    const r = await nestAdminDeleteProperty(token, id);
    setBusyId(null);
    if (r.ok) await refresh();
    else setLoadError(r.error ?? 'Smazání inzerátu selhalo');
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

  async function onUserRoleChange(userId: string, newRole: string) {
    if (!token) return;
    setBusyUserId(userId);
    const r = await nestAdminUpdateUserRole(token, userId, newRole);
    setBusyUserId(null);
    if (r.ok) await refresh();
    else setLoadError(r.error ?? 'Změna role selhala');
  }

  async function onDeleteUserRow(u: AdminUserRow) {
    if (!token) return;
    if (!window.confirm(`Opravdu smazat účet ${u.email}? Tato akce je nevratná.`)) {
      return;
    }
    setBusyUserId(u.id);
    const r = await nestAdminDeleteUser(token, u.id);
    setBusyUserId(null);
    if (r.ok) await refresh();
    else setLoadError(r.error ?? 'Mazání uživatele selhalo');
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

  if (!token || !user || user.role !== 'ADMIN') {
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Uživatelé" value={stats?.users ?? '—'} />
            <StatCard title="Nemovitosti" value={stats?.properties ?? '—'} />
            <StatCard title="Čeká na schválení" value={stats?.pendingProperties ?? '—'} />
            <StatCard title="Návštěvy" value={stats?.visits ?? '—'} />
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Čekající inzeráty</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {properties.length === 0 ? (
              <p className="text-sm text-zinc-500">Žádné čekající inzeráty.</p>
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
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busyId === prop.id}
                          onClick={() => void onApprove(prop.id)}
                          className="w-full rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
                        >
                          {busyId === prop.id ? 'Schvaluji…' : 'Schválit'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === prop.id}
                          onClick={() => void onDeleteProperty(prop.id)}
                          className="w-full rounded-xl border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {busyId === prop.id ? 'Mažu…' : 'Smazat'}
                        </button>
                      </div>
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
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Registrace</th>
                  <th className="px-4 py-3 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50/80">
                    <td className="px-4 py-3 font-medium text-zinc-900">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={busyUserId === u.id}
                        onChange={(e) => void onUserRoleChange(u.id, e.target.value)}
                        className="max-w-[11rem] rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15 disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-500 sm:table-cell">
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString('cs-CZ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyUserId === u.id || u.id === user?.id}
                        title={
                          u.id === user?.id
                            ? 'Nelze smazat vlastní účet'
                            : 'Smazat uživatele'
                        }
                        onClick={() => void onDeleteUserRow(u)}
                        className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Smazat
                      </button>
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
