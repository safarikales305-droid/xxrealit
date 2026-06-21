'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCreatePortalTestAccount,
  nestAdminListPortalTestAccounts,
  nestAdminResetPortalTestAccount,
  nestAdminRunPortalTestScenario,
  nestAdminUpdatePortalTestAccount,
  type PortalTestAccountRow,
  type PortalTestScenarioResult,
} from '@/lib/nest-client';

const ROLE_OPTIONS = [
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
] as const;

const SCENARIOS: Array<{ id: string; label: string }> = [
  { id: 'lead_with_credit', label: 'Test leadu s kreditem' },
  { id: 'lead_without_credit', label: 'Test leadu bez kreditu' },
  { id: 'contact_unlock', label: 'Test odemčení kontaktu' },
  { id: 'shorts_contact', label: 'Test Shorts kontaktu' },
  { id: 'classic_contact', label: 'Test Classic kontaktu' },
  { id: 'tipster_paid_credit', label: 'Test tipaře placeným kreditem' },
  { id: 'tipster_bonus_credit', label: 'Test tipaře bonusovým kreditem' },
  { id: 'whatsapp_verify', label: 'Test ověření WhatsApp' },
  { id: 'email_verify', label: 'Test ověření e-mailu' },
  { id: 'professional_verified', label: 'Test ověřeného profesionála' },
  { id: 'pwa_notification', label: 'Test PWA upozornění' },
  { id: 'whatsapp_message', label: 'Test WhatsApp zprávy' },
  { id: 'email_message', label: 'Test e-mail zprávy' },
];

export default function AdminPortalTestingPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;

  const [items, setItems] = useState<PortalTestAccountRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarioResult, setScenarioResult] = useState<PortalTestScenarioResult | null>(null);

  const [name, setName] = useState('Test Uživatel');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('AGENT');
  const [password, setPassword] = useState('test123456');
  const [paidCredit, setPaidCredit] = useState(500);
  const [bonusCredit, setBonusCredit] = useState(100);
  const [testPhone, setTestPhone] = useState('+420777000000');
  const [emailVerified, setEmailVerified] = useState(true);
  const [whatsappVerified, setWhatsappVerified] = useState(true);
  const [profileApproved, setProfileApproved] = useState(false);
  const [publicProfile, setPublicProfile] = useState(false);
  const [publicVisible, setPublicVisible] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminListPortalTestAccounts(token);
    setItems(data.items);
    if (!selectedId && data.items[0]) setSelectedId(data.items[0].id);
  }, [token, selectedId]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  const selected = items.find((x) => x.id === selectedId) ?? null;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setBusyId('create');
    const r = await nestAdminCreatePortalTestAccount(token, {
      name: name.trim(),
      email: email.trim(),
      role,
      password,
      paidCredit,
      bonusCredit,
      testPhone: testPhone.trim(),
      emailVerified,
      whatsappVerified,
      profileApproved,
      publicProfile,
      publicVisible,
    });
    setBusyId(null);
    if (!r.ok) {
      setError(r.error ?? 'Vytvoření selhalo');
      return;
    }
    if (r.account) setSelectedId(r.account.id);
    await refresh();
  }

  async function onTogglePublicVisible(account: PortalTestAccountRow) {
    if (!token) return;
    setBusyId(account.id);
    const r = await nestAdminUpdatePortalTestAccount(token, account.id, {
      publicVisible: !account.testAccountPublicVisible,
    });
    setBusyId(null);
    if (!r.ok) setError(r.error ?? 'Uložení selhalo');
    else await refresh();
  }

  async function onReset(userId: string) {
    if (!token) return;
    if (!window.confirm('Resetovat testovací účet?')) return;
    setBusyId(userId);
    setError(null);
    const r = await nestAdminResetPortalTestAccount(token, userId);
    setBusyId(null);
    if (!r.ok) setError(r.error ?? 'Reset selhal');
    else await refresh();
  }

  async function onScenario(userId: string, scenario: string) {
    if (!token) return;
    setBusyId(`${userId}:${scenario}`);
    setError(null);
    setScenarioResult(null);
    const r = await nestAdminRunPortalTestScenario(token, userId, scenario);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error ?? 'Scénář selhal');
      return;
    }
    if (r.result) setScenarioResult(r.result);
    await refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <Link href="/admin" className="text-sm font-semibold text-[#e85d00] hover:underline">
              ← Administrace
            </Link>
            <h1 className="mt-1 text-xl font-bold text-zinc-900">Testování portálu</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {scenarioResult ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <strong>{scenarioResult.message}</strong>
            {scenarioResult.hint ? ` ${scenarioResult.hint}` : ''}
            {scenarioResult.url ? (
              <>
                {' '}
                <Link href={scenarioResult.url} className="font-semibold underline">
                  Otevřít
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Vytvořit testovací účet</h2>
          <form onSubmit={(e) => void onCreate(e)} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Jméno</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Heslo</span>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                minLength={6}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Počáteční paidCredit (Kč)</span>
              <input
                type="number"
                min={0}
                value={paidCredit}
                onChange={(e) => setPaidCredit(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Počáteční bonusCredit (Kč)</span>
              <input
                type="number"
                min={0}
                value={bonusCredit}
                onChange={(e) => setBonusCredit(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700">Testovací telefon</span>
              <input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={emailVerified}
                onChange={(e) => setEmailVerified(e.target.checked)}
              />
              E-mail ověřen
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={whatsappVerified}
                onChange={(e) => setWhatsappVerified(e.target.checked)}
              />
              WhatsApp ověřen
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={profileApproved}
                onChange={(e) => setProfileApproved(e.target.checked)}
              />
              Profil schválen
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={publicProfile}
                onChange={(e) => setPublicProfile(e.target.checked)}
              />
              Veřejný profil
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={publicVisible}
                onChange={(e) => setPublicVisible(e.target.checked)}
              />
              Zobrazit testovací účet veřejně
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busyId === 'create'}
                className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d45500] disabled:opacity-60"
              >
                {busyId === 'create' ? 'Vytvářím…' : 'Vytvořit testovací účet'}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Testovací účty ({items.length})</h2>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">Zatím žádný testovací účet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {items.map((account) => (
                <div
                  key={account.id}
                  className={`rounded-xl border p-4 ${
                    selectedId === account.id ? 'border-orange-300 bg-orange-50/40' : 'border-zinc-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {account.name}{' '}
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                          TEST
                        </span>
                      </p>
                      <p className="text-sm text-zinc-600">
                        {account.email} · {account.role} · paid {account.paidCredit} Kč · bonus{' '}
                        {account.bonusCredit} Kč
                      </p>
                      <p className="text-xs text-zinc-500">
                        WA: {account.whatsappPhone}{' '}
                        {account.whatsappVerified ? '✓' : '✗'} · e-mail{' '}
                        {account.emailVerified ? '✓' : '✗'} · profil{' '}
                        {account.profileApproved ? 'schválen' : 'neschválen'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(account.id)}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-50"
                      >
                        Vybrat scénáře
                      </button>
                      <button
                        type="button"
                        disabled={busyId === account.id}
                        onClick={() => void onTogglePublicVisible(account)}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
                      >
                        {account.testAccountPublicVisible
                          ? 'Skrýt z veřejnosti'
                          : 'Zobrazit veřejně'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === account.id}
                        onClick={() => void onReset(account.id)}
                        className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                      >
                        {busyId === account.id ? 'Resetuji…' : 'Resetovat test'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {selected ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">
              Rychlé scénáře — {selected.name}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busyId === `${selected.id}:${s.id}`}
                  onClick={() => void onScenario(selected.id, s.id)}
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-60"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
