'use client';

import Link from 'next/link';
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
  { value: 'AGENCY', label: 'RK' },
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

export default function PortalWorkerProfilePage() {
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
    setOk(r.message ?? 'Předregistrace odeslána.');
    setClientName('');
    setClientEmail('');
    setClientPhone('');
    setClientCity('');
    setClientNote('');
    await refresh();
  }

  if (!user || user.role !== 'PORTAL_WORKER') return null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/profil" className="text-sm font-semibold text-[#e85d00] hover:underline">
        ← Zpět na profil
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">Pracovník portálu</h1>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Stav</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-700">
          <li>
            Schválení:{' '}
            <strong>{STATUS_LABEL[me?.portalWorkerStatus ?? ''] ?? me?.portalWorkerStatus ?? '—'}</strong>
          </li>
          <li>E-mail: {me?.emailVerified ? '✓ Ověřen' : '✗ Neověřen'}</li>
          <li>WhatsApp: {me?.whatsappVerified ? '✓ Ověřeno' : '✗ Neověřeno'}</li>
          <li>Doporučení klientů: {dash?.clientCount ?? 0}</li>
          <li>Celková provize: {(dash?.totalCommission ?? 0).toLocaleString('cs-CZ')} Kč</li>
          <li>Čekající: {(dash?.pendingCommission ?? 0).toLocaleString('cs-CZ')} Kč</li>
          <li>Vyplacené: {(dash?.paidCommission ?? 0).toLocaleString('cs-CZ')} Kč</li>
        </ul>
      </section>

      {me?.portalWorkerStatus === 'APPROVED' && me.emailVerified && me.whatsappVerified ? (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
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
              placeholder="Telefon"
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
              {busy ? 'Odesílám…' : 'Vytvořit předregistraci'}
            </button>
          </form>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="mt-2 text-sm text-emerald-700">{ok}</p> : null}
        </section>
      ) : (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Pro doporučování klientů dokončete ověření e-mailu a WhatsApp a počkejte na schválení adminem.
        </p>
      )}

      {dash?.clients?.length ? (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Moji klienti</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {dash.clients.map((c) => (
              <li key={c.id} className="rounded-lg border border-zinc-100 px-3 py-2">
                <strong>{c.name}</strong> · {c.role} · {c.status}
                <br />
                Dobití: {c.totalTopUp.toLocaleString('cs-CZ')} Kč · Provize:{' '}
                {c.totalCommission.toLocaleString('cs-CZ')} Kč
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
