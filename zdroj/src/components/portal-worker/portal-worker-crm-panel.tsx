'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestFetchMe, type NestMeProfile } from '@/lib/nest-client';
import {
  WORKER_CLIENT_ROLES,
  NOTE_TYPES,
  REG_STATUS_LABEL,
  addWorkerClientNote,
  createWorkerClient,
  fetchWorkerClientDetail,
  fetchWorkerClients,
  fetchWorkerCrmOverview,
  grantWorkerClientBonus,
  sendWorkerClientEmail,
  sendWorkerClientWhatsapp,
  type WorkerClientRow,
  type WorkerCrmOverview,
} from '@/lib/portal-worker-crm-api';
import { PortalWorkerSettingsPanel } from '@/components/portal-worker/portal-worker-settings-panel';
import { WorkerClientEditForm } from '@/components/portal-worker/worker-client-edit-form';

export type WorkerCrmSection =
  | 'overview'
  | 'clients'
  | 'registrations'
  | 'invites'
  | 'credits'
  | 'commissions'
  | 'stats'
  | 'notes'
  | 'settings'
  | 'client-detail';

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Čeká na schválení',
  APPROVED: 'Schválen',
  REJECTED: 'Zamítnut',
  SUSPENDED: 'Pozastaven',
};

type Props = {
  section: WorkerCrmSection;
  clientId?: string;
};

export function PortalWorkerCrmPanel({ section, clientId }: Props) {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [me, setMe] = useState<NestMeProfile | null>(null);
  const [overview, setOverview] = useState<WorkerCrmOverview | null>(null);
  const [clients, setClients] = useState<WorkerClientRow[]>([]);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    targetRole: 'AGENT',
    firstName: '',
    lastName: '',
    company: '',
    name: '',
    email: '',
    phone: '',
    whatsappPhone: '',
    ico: '',
    city: '',
    note: '',
  });

  const [noteForm, setNoteForm] = useState({ noteType: 'PHONE_CALL', body: '' });
  const [bonusAmount, setBonusAmount] = useState('500');

  const refresh = useCallback(async () => {
    const [profile, dash, clientList] = await Promise.all([
      apiAccessToken ? nestFetchMe(apiAccessToken) : null,
      fetchWorkerCrmOverview(),
      fetchWorkerClients(search || undefined),
    ]);
    setMe(profile);
    setOverview(dash);
    setClients(clientList?.items ?? []);
    if (clientId && section === 'client-detail') {
      const d = await fetchWorkerClientDetail(clientId);
      setDetail(d);
    }
  }, [apiAccessToken, search, clientId, section]);

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

  const canWork =
    me?.portalWorkerStatus === 'APPROVED' &&
    me.emailVerified &&
    me.whatsappVerified &&
    overview?.isActive !== false;

  async function onCreateClient(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const name =
      form.name.trim() ||
      [form.firstName, form.lastName].filter(Boolean).join(' ') ||
      form.company.trim();
    const r = await createWorkerClient({ ...form, name });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení selhalo');
      return;
    }
    setOk(r.message ?? 'Zahájená registrace vytvořena.');
    setForm({
      targetRole: 'AGENT',
      firstName: '',
      lastName: '',
      company: '',
      name: '',
      email: '',
      phone: '',
      whatsappPhone: '',
      ico: '',
      city: '',
      note: '',
    });
    await refresh();
  }

  if (!user || user.role !== 'PORTAL_WORKER') return null;

  const clientForm = (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-zinc-900">Založit klienta po telefonu</h2>
      <p className="mt-1 text-sm text-zinc-500">Vznikne stav „Zahájená registrace“ — účet může být neaktivní.</p>
      {canWork ? (
        <form onSubmit={(e) => void onCreateClient(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <select
            value={form.targetRole}
            onChange={(e) => setForm((f) => ({ ...f, targetRole: e.target.value }))}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
          >
            {WORKER_CLIENT_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <input placeholder="Jméno *" required value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
          <input placeholder="Příjmení" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
          <input placeholder="Firma" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" />
          <input type="email" placeholder="E-mail *" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
          <input placeholder="Telefon *" required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
          <input placeholder="WhatsApp *" required value={form.whatsappPhone} onChange={(e) => setForm((f) => ({ ...f, whatsappPhone: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
          <input placeholder="IČO" value={form.ico} onChange={(e) => setForm((f) => ({ ...f, ico: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
          <input placeholder="Město" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
          <textarea placeholder="Poznámka" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" rows={2} />
          <button type="submit" disabled={busy} className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white sm:col-span-2">
            {busy ? 'Ukládám…' : 'Uložit zahájenou registraci'}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-amber-800">Po schválení a ověření kontaktů budete moci zakládat klienty.</p>
      )}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="mt-2 text-sm text-emerald-700">{ok}</p> : null}
    </section>
  );

  const cards = overview?.cards;

  if (section === 'overview') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">Přehled CRM</h2>
          <p className="text-sm text-zinc-600">Vítejte, {me?.name ?? user.name}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Moji klienti', cards?.clientCount ?? 0],
            ['Čekající registrace', cards?.pendingRegistrations ?? 0],
            ['Vyžaduje kontakt', cards?.needsContact ?? 0],
            ['Moje provize', `${(cards?.myCommission ?? 0).toLocaleString('cs-CZ')} Kč`],
            ['Bonusové kredity', `${(cards?.bonusCreditsGranted ?? 0).toLocaleString('cs-CZ')} Kč`],
            ['Dobité kredity', `${(cards?.paidCredits ?? 0).toLocaleString('cs-CZ')} Kč`],
            ['Dnešní telefonáty', cards?.todayCalls ?? 0],
            ['Limit bonusu / klient', `${overview?.maxBonusPerClient ?? 3000} Kč`],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{val}</p>
            </div>
          ))}
        </div>
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <p>
            Stav: <strong>{STATUS_LABEL[me?.portalWorkerStatus ?? ''] ?? '—'}</strong> · E-mail{' '}
            {me?.emailVerified ? '✓' : '✗'} · WhatsApp {me?.whatsappVerified ? '✓' : '✗'}
          </p>
        </section>
        {clientForm}
      </div>
    );
  }

  if (section === 'clients' || section === 'registrations' || section === 'invites') {
    const filtered =
      section === 'registrations' || section === 'invites'
        ? clients.filter((c) => c.kind === 'preregistration')
        : clients;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-bold">
            {section === 'clients' ? 'Moji klienti' : section === 'registrations' ? 'Zahájené registrace' : 'Pozvánky'}
          </h2>
          <input
            type="search"
            placeholder="Hledat…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        {(section === 'registrations' || section === 'invites') && clientForm}
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Jméno</th>
                <th className="px-3 py-2">Firma</th>
                <th className="px-3 py-2">Typ</th>
                <th className="px-3 py-2">Telefon</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Stav</th>
                <th className="px-3 py-2">Kredity</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                    Žádné záznamy
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={`${c.kind}-${c.id}`} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2">{c.company || '—'}</td>
                    <td className="px-3 py-2">{c.roleLabel}</td>
                    <td className="px-3 py-2">{c.phone}</td>
                    <td className="px-3 py-2">{c.email}</td>
                    <td className="px-3 py-2">{REG_STATUS_LABEL[c.registrationStatus] ?? c.registrationStatus}</td>
                    <td className="px-3 py-2">
                      B:{c.bonusCredit} / P:{c.paidCredit}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/pracovnik/klienti/${c.kind === 'preregistration' ? c.id : c.id}`} className="text-[#e85d00] hover:underline">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section === 'client-detail' && clientId) {
    return (
      <div className="space-y-6">
        <Link href="/pracovnik/klienti" className="text-sm text-[#e85d00] hover:underline">
          ← Moji klienti
        </Link>
        <WorkerClientEditForm clientId={clientId} />
      </div>
    );
  }

  if (section === 'credits') {
    const active = clients.filter((c) => c.kind === 'client');
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Kredity klientů</h2>
        <p className="text-sm text-zinc-600">Bonusové kredity nejsou placené — provize vzniká jen z reálného dobití.</p>
        <ul className="space-y-2">
          {active.map((c) => (
            <li key={c.id} className="rounded-xl border bg-white px-4 py-3 text-sm">
              <strong>{c.name}</strong> — bonus: {c.bonusCredit} Kč · dobito: {c.paidCredit} Kč
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (section === 'commissions') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Provize</h2>
        <p className="text-sm text-zinc-600">Provize pouze z placených kreditů (nikdy z bonusů).</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-zinc-500">Čekající</p>
            <p className="text-lg font-bold">{(overview?.pendingCommission ?? 0).toLocaleString('cs-CZ')} Kč</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-zinc-500">Schválené</p>
            <p className="text-lg font-bold">{(overview?.approvedCommission ?? 0).toLocaleString('cs-CZ')} Kč</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-zinc-500">Vyplacené</p>
            <p className="text-lg font-bold">{(overview?.paidCommission ?? 0).toLocaleString('cs-CZ')} Kč</p>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'stats') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Statistiky</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-zinc-500">Klienti</p>
            <p className="text-2xl font-bold">{overview?.clientCount ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-zinc-500">Zahájené registrace</p>
            <p className="text-2xl font-bold">{cards?.pendingRegistrations ?? 0}</p>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'notes') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Poznámky</h2>
        <p className="text-sm text-zinc-600">Poznámky přidáváte v detailu klienta. Zde přehled posledních klientů.</p>
        <ul className="space-y-2 text-sm">
          {clients.slice(0, 20).map((c) => (
            <li key={c.id}>
              <Link href={`/pracovnik/klienti/${c.id}`} className="text-[#e85d00] hover:underline">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (section === 'settings') {
    return <PortalWorkerSettingsPanel />;
  }

  return null;
}
