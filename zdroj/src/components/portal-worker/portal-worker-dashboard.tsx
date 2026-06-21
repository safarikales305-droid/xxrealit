'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestCreateClientPreregistration,
  nestFetchMe,
  nestPortalWorkerDashboard,
  type NestMeProfile,
  type PortalWorkerDashboard,
} from '@/lib/nest-client';

const CLIENT_ROLES = [
  { value: 'AGENT', label: 'Makléř' },
  { value: 'AGENCY', label: 'Realitní kancelář' },
  { value: 'COMPANY', label: 'Stavební firma' },
  { value: 'INVESTOR', label: 'Investor' },
  { value: 'FINANCIAL_ADVISOR', label: 'Finanční poradce' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Čeká na schválení',
  APPROVED: 'Schválen',
  REJECTED: 'Zamítnut',
  SUSPENDED: 'Pozastaven',
};

const PREREG_STATUS: Record<string, string> = {
  PENDING: 'Čeká na dokončení',
  COMPLETED: 'Dokončeno',
  EXPIRED: 'Vypršelo',
};

type Section = 'overview' | 'clients' | 'invites' | 'commissions' | 'stats' | 'settings';

export function PortalWorkerDashboardView({ section }: { section: Section }) {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [me, setMe] = useState<NestMeProfile | null>(null);
  const [dash, setDash] = useState<PortalWorkerDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [targetRole, setTargetRole] = useState('AGENT');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientNote, setClientNote] = useState('');

  const refresh = useCallback(async () => {
    if (!apiAccessToken) return;
    const [profile, dashboard] = await Promise.all([
      nestFetchMe(apiAccessToken),
      nestPortalWorkerDashboard(apiAccessToken),
    ]);
    setMe(profile);
    setDash(dashboard);
  }, [apiAccessToken]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'PORTAL_WORKER') {
      router.replace('/profil');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  async function onCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!apiAccessToken) return;
    setBusy(true);
    setError(null);
    setOk(null);
    const r = await nestCreateClientPreregistration(apiAccessToken, {
      targetRole,
      name: clientName.trim(),
      email: clientEmail.trim(),
      phone: clientPhone.trim(),
      city: clientCity.trim(),
      note: clientNote.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Vytvoření selhalo');
      return;
    }
    setOk(r.message ?? 'Předregistrace odeslána. Klient obdrží e-mail s pozvánkou.');
    setClientName('');
    setClientEmail('');
    setClientPhone('');
    setClientCity('');
    setClientNote('');
    await refresh();
  }

  if (!user || user.role !== 'PORTAL_WORKER') return null;

  const canCreateClients =
    me?.portalWorkerStatus === 'APPROVED' &&
    me.emailVerified &&
    me.whatsappVerified &&
    dash?.isActive !== false;

  const createForm = canCreateClients ? (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Nová předregistrace klienta</h2>
      <form onSubmit={(e) => void onCreateClient(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <select
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
        >
          {CLIENT_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Jméno / firma"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          required
        />
        <input
          type="email"
          placeholder="E-mail"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          required
        />
        <input
          placeholder="Telefon (+420…)"
          value={clientPhone}
          onChange={(e) => setClientPhone(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          required
        />
        <input
          placeholder="Město"
          value={clientCity}
          onChange={(e) => setClientCity(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Poznámka"
          value={clientNote}
          onChange={(e) => setClientNote(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
          rows={2}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white sm:col-span-2"
        >
          {busy ? 'Odesílám…' : 'Vytvořit a odeslat pozvánku'}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="mt-2 text-sm text-emerald-700">{ok}</p> : null}
    </section>
  ) : (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Pro zakládání klientů dokončete ověření e-mailu a WhatsApp. Po schválení adminem budete moci
      odesílat pozvánky.
    </p>
  );

  if (section === 'overview') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Přehled</h2>
          <p className="mt-1 text-sm text-zinc-600">Vítejte, {me?.name ?? user.name ?? user.email}</p>
        </div>
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Stav účtu</h3>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            <li>
              Schválení:{' '}
              <strong>
                {STATUS_LABEL[me?.portalWorkerStatus ?? ''] ?? me?.portalWorkerStatus ?? '—'}
              </strong>
            </li>
            <li>E-mail: {me?.emailVerified ? '✓ Ověřen' : '✗ Neověřen'}</li>
            <li>WhatsApp: {me?.whatsappVerified ? '✓ Ověřeno' : '✗ Neověřeno'}</li>
            <li>Klienti: {dash?.clientCount ?? 0}</li>
            <li>Provize celkem: {(dash?.totalCommission ?? 0).toLocaleString('cs-CZ')} Kč</li>
          </ul>
        </section>
        {createForm}
      </div>
    );
  }

  if (section === 'clients') {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold">Moji klienti</h2>
        {createForm}
        {dash?.clients?.length ? (
          <ul className="space-y-2 text-sm">
            {dash.clients.map((c) => (
              <li key={c.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <strong>{c.name}</strong> · {c.role} · {c.status}
                <br />
                Dobití (placený kredit): {c.totalTopUp.toLocaleString('cs-CZ')} Kč · Provize:{' '}
                {c.totalCommission.toLocaleString('cs-CZ')} Kč
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">Zatím nemáte žádné dokončené klienty.</p>
        )}
      </div>
    );
  }

  if (section === 'invites') {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold">Pozvánky</h2>
        {createForm}
        {dash?.preregistrations?.length ? (
          <ul className="space-y-2 text-sm">
            {dash.preregistrations.map((p) => (
              <li key={p.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <strong>{p.name}</strong> · {p.email} · {p.targetRole}
                <br />
                {PREREG_STATUS[p.status] ?? p.status} · odesláno{' '}
                {new Date(p.createdAt).toLocaleString('cs-CZ')}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">Zatím žádné pozvánky.</p>
        )}
      </div>
    );
  }

  if (section === 'commissions') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Provize</h2>
        <p className="text-sm text-zinc-600">
          Provize vzniká pouze z placeného kreditu klientů (ne z bonusů).
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Čekající</p>
            <p className="text-lg font-bold">{(dash?.pendingCommission ?? 0).toLocaleString('cs-CZ')} Kč</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Schválené</p>
            <p className="text-lg font-bold">
              {(dash?.approvedCommission ?? 0).toLocaleString('cs-CZ')} Kč
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Vyplacené</p>
            <p className="text-lg font-bold">{(dash?.paidCommission ?? 0).toLocaleString('cs-CZ')} Kč</p>
          </div>
        </div>
        {dash?.commissions?.length ? (
          <ul className="space-y-2 text-sm">
            {dash.commissions.map((c) => (
              <li key={c.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                {c.referredUserName} · {c.topUpAmount.toLocaleString('cs-CZ')} Kč ({c.percent} %) →{' '}
                {c.commissionAmount.toLocaleString('cs-CZ')} Kč · {c.status}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (section === 'stats') {
    const turnover =
      dash?.clients?.reduce((s, c) => s + c.totalTopUp, 0) ?? 0;
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Statistiky</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Počet klientů</p>
            <p className="text-2xl font-bold">{dash?.clientCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Obrat klientů (placený kredit)</p>
            <p className="text-2xl font-bold">{turnover.toLocaleString('cs-CZ')} Kč</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Celková provize</p>
            <p className="text-2xl font-bold">
              {(dash?.totalCommission ?? 0).toLocaleString('cs-CZ')} Kč
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">Čekající pozvánky</p>
            <p className="text-2xl font-bold">
              {dash?.preregistrations?.filter((p) => p.status === 'PENDING').length ?? 0}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Nastavení účtu</h2>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
        <p>
          <strong>Jméno:</strong> {me?.name ?? '—'}
        </p>
        <p className="mt-1">
          <strong>E-mail:</strong> {me?.email ?? user.email}
        </p>
        <p className="mt-1">
          <strong>Telefon:</strong> {me?.phone ?? '—'}
        </p>
        <p className="mt-1">
          <strong>Město:</strong> {me?.city ?? '—'}
        </p>
        <p className="mt-4 text-zinc-600">
          Pro ověření e-mailu a WhatsApp použijte odkaz z e-mailu a sekci v tomto panelu po
          schválení účtu.
        </p>
      </section>
    </div>
  );
}
