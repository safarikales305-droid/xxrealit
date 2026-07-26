'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  API_BASE_URL,
} from '@/lib/api';
import {
  nestAdminAiOpenAiUrl,
  nestAdminHealthCheck,
  nestAdminOpenAiSettings,
  nestAdminOpenAiTest,
  nestAdminOpenAiUpdateSettings,
  type NestAdminAiApiError,
  type NestAdminAiSettingsResponse,
  type NestAdminAiSettingsView,
  type NestAdminAiUsageSummary,
  type NestAdminOpenAiStatus,
} from '@/lib/nest-client';

const MODELS = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'gpt-5-mini'];

const EMPTY_USAGE: NestAdminAiUsageSummary = {
  requestsToday: 0,
  requestsThisMonth: 0,
  successfulToday: 0,
  failedToday: 0,
  inputTokensToday: 0,
  outputTokensToday: 0,
  inputTokensMonth: 0,
  outputTokensMonth: 0,
  estimatedCostCzkToday: 0,
  estimatedCostCzkMonth: 0,
  avgDurationMsToday: 0,
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xl font-bold text-zinc-900">{value}</p>
      <p className="text-sm text-zinc-600">{label}</p>
    </div>
  );
}

export default function AdminAiCentrumPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [requestUrl, setRequestUrl] = useState<string>(nestAdminAiOpenAiUrl('/settings'));
  const [status, setStatus] = useState<NestAdminOpenAiStatus | null>(null);
  const [data, setData] = useState<NestAdminAiSettingsResponse | null>(null);
  const [usage, setUsage] = useState<NestAdminAiUsageSummary>(EMPTY_USAGE);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [healthMsg, setHealthMsg] = useState<string | null>(null);

  const loadAiSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHttpStatus(null);
    setRequestUrl(nestAdminAiOpenAiUrl('/settings'));

    if (!token) {
      setError('Nejste přihlášeni.');
      setLoading(false);
      return;
    }

    try {
      const settingsData = await nestAdminOpenAiSettings(token);
      setData(settingsData);
      setStatus(settingsData.status);
      setUsage(settingsData.usage ?? EMPTY_USAGE);
    } catch (e) {
      console.error('AI centrum load error:', e);
      const err = e as NestAdminAiApiError;
      setError(err.message || 'AI centrum se nepodařilo načíst.');
      setHttpStatus(err.httpStatus ?? null);
      if (err.requestUrl) setRequestUrl(err.requestUrl);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (!isLoading && token && user?.role === 'ADMIN') {
      void loadAiSettings();
    }
  }, [isLoading, token, user, loadAiSettings]);

  async function save(patch: Partial<NestAdminAiSettingsView>) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      await nestAdminOpenAiUpdateSettings(token, patch);
      await loadAiSettings();
      setMsg('Nastavení uloženo.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Uložení selhalo');
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await nestAdminOpenAiTest(token);
      setMsg(res.message);
      await loadAiSettings();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Test selhal');
    } finally {
      setBusy(false);
    }
  }

  async function verifyBackend() {
    setHealthMsg(null);
    const health = await nestAdminHealthCheck();
    if (!health.ok) {
      setHealthMsg(`Backend: ${health.error} (HTTP ${health.status || '—'})`);
      return;
    }
    setHealthMsg(
      `Backend OK (${health.data.status}, DB: ${health.data.database}) · ${health.data.timestamp ?? ''} · AI endpoint: ${nestAdminAiOpenAiUrl('/settings')}`,
    );
  }

  if (isLoading || (!token && user?.role === 'ADMIN')) {
    return <p className="text-sm text-zinc-500">Načítám AI centrum…</p>;
  }

  if (!token || user?.role !== 'ADMIN') return null;

  if (loading) {
    return <p className="text-sm text-zinc-500">Načítám AI centrum…</p>;
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-800">AI centrum se nepodařilo načíst</h2>
        <p className="mt-2 text-sm text-red-700">
          <strong>Chyba:</strong> {error}
        </p>
        {httpStatus != null ? (
          <p className="mt-1 text-sm text-red-700">
            <strong>HTTP status:</strong> {httpStatus || 'síťová chyba / timeout'}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-red-600">
          <strong>GET</strong> {requestUrl || nestAdminAiOpenAiUrl('/settings')}
        </p>
        <p className="mt-1 text-xs text-red-600">
          NEXT_PUBLIC_API_URL → {API_BASE_URL || '(nenastaveno)'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadAiSettings()}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Načíst znovu
          </button>
          <button
            type="button"
            onClick={() => void verifyBackend()}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm"
          >
            Ověřit backend
          </button>
        </div>
        {healthMsg ? <p className="mt-3 text-sm text-red-800">{healthMsg}</p> : null}
      </div>
    );
  }

  const settings = data?.settings;
  const env = data?.env;
  const displayStatus = status ?? data?.status;
  const connectedLabel = !displayStatus?.apiKeyConfigured
    ? 'Nepřipojeno'
    : displayStatus.connected === true
      ? 'Připojeno'
      : displayStatus.connected === false
        ? 'Test selhal'
        : 'Nekonfigurováno / netestováno';

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        Centrální OpenAI integrace pro SEO, popisy, e-maily a{' '}
        <a href="/admin/marketing/ai-chat" className="font-semibold text-orange-600 underline">
          veřejný AI chat →
        </a>
      </p>
      <p className="mb-6 text-sm text-zinc-600">
        Centrální správa OpenAI pro portál XXREALIT. Requesty jdou na NestJS backend (
        <code className="text-xs">{nestAdminAiOpenAiUrl('/settings')}</code>
        ).
      </p>

      {error ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Částečná chyba: {error}
          {httpStatus != null ? ` (HTTP ${httpStatus})` : ''}
        </p>
      ) : null}

      {msg ? <p className="mb-4 rounded-lg bg-zinc-100 px-4 py-2 text-sm">{msg}</p> : null}
      {healthMsg ? <p className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-900">{healthMsg}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void loadAiSettings()}
          disabled={busy}
          className="rounded-lg border px-3 py-1.5 text-sm"
        >
          Obnovit stav
        </button>
        <button
          type="button"
          onClick={() => void verifyBackend()}
          disabled={busy}
          className="rounded-lg border px-3 py-1.5 text-sm"
        >
          Ověřit backend
        </button>
      </div>

      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Připojení OpenAI</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Stav" value={connectedLabel} />
          <Stat label="AI zapnuta" value={displayStatus?.enabled ? 'Ano' : 'Ne'} />
          <Stat label="API klíč nastaven" value={displayStatus?.apiKeyConfigured ? 'Ano' : 'Ne'} />
          <Stat label="Model" value={displayStatus?.model ?? settings?.defaultModel ?? '—'} />
        </div>
        <div className="mt-4 space-y-1 text-sm text-zinc-600">
          <p>{displayStatus?.message ?? 'OpenAI není připojeno.'}</p>
          {env?.apiKeyMasked ? <p>Maskovaný klíč: {env.apiKeyMasked}</p> : null}
          <p>{env?.apiKeyHelp ?? 'API klíč je bezpečně uložen v Railway proměnných backendu.'}</p>
          {settings?.lastConnectionTestAt ? (
            <p>
              Poslední test: {new Date(settings.lastConnectionTestAt).toLocaleString('cs-CZ')}
              {settings.lastConnectionSuccess ? ' — úspěch' : ' — chyba'}
            </p>
          ) : displayStatus?.apiKeyConfigured ? (
            <p>OpenAI je nakonfigurováno, ale připojení ještě nebylo otestováno.</p>
          ) : null}
          {settings?.lastConnectionError || displayStatus?.lastError ? (
            <p className="text-red-600">
              Poslední chyba: {settings?.lastConnectionError ?? displayStatus?.lastError}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy || !displayStatus?.apiKeyConfigured}
          onClick={() => void testConnection()}
          className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Testuji…' : 'Otestovat připojení'}
        </button>
      </section>

      {settings ? (
        <>
          <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold">Konfigurace</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => void save({ enabled: e.target.checked })}
                  disabled={busy}
                />
                Povolit OpenAI
              </label>
              <div>
                <label className="mb-1 block text-sm font-medium">Model</label>
                <select
                  value={settings.defaultModel}
                  onChange={(e) => void save({ defaultModel: e.target.value })}
                  disabled={busy}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Denní limit požadavků</label>
                <input
                  type="number"
                  value={settings.dailyRequestLimit}
                  onChange={(e) => void save({ dailyRequestLimit: Number(e.target.value) })}
                  disabled={busy}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Měsíční rozpočet (Kč)</label>
                <input
                  type="number"
                  value={settings.monthlyBudgetCzk}
                  onChange={(e) => void save({ monthlyBudgetCzk: Number(e.target.value) })}
                  disabled={busy}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Max. délka výstupu (tokeny)</label>
                <input
                  type="number"
                  value={settings.maxOutputTokens}
                  onChange={(e) => void save({ maxOutputTokens: Number(e.target.value) })}
                  disabled={busy}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Timeout (ms)</label>
                <input
                  type="number"
                  value={settings.timeoutMs}
                  onChange={(e) => void save({ timeoutMs: Number(e.target.value) })}
                  disabled={busy}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold">Povolené funkce</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['seoEnabled', 'SEO generování'],
                  ['listingDescriptionEnabled', 'Popisy inzerátů'],
                  ['socialPostEnabled', 'Sociální příspěvky'],
                  ['emailEnabled', 'E-maily'],
                  ['supportEnabled', 'Zákaznická podpora / AI chat'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(e) => void save({ [key]: e.target.checked })}
                    disabled={busy}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Přehled využití</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Požadavky dnes" value={usage.requestsToday} />
          <Stat label="Požadavky tento měsíc" value={usage.requestsThisMonth} />
          <Stat label="Úspěšné dnes" value={usage.successfulToday} />
          <Stat label="Neúspěšné dnes" value={usage.failedToday} />
          <Stat label="Vstupní tokeny (měsíc)" value={usage.inputTokensMonth} />
          <Stat label="Výstupní tokeny (měsíc)" value={usage.outputTokensMonth} />
          <Stat label="Odhad nákladů dnes (Kč)" value={usage.estimatedCostCzkToday} />
          <Stat label="Odhad nákladů měsíc (Kč)" value={usage.estimatedCostCzkMonth} />
          <Stat label="Prům. doba odpovědi (ms)" value={usage.avgDurationMsToday} />
        </div>
      </section>
    </>
  );
}
