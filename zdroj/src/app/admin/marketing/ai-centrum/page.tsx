'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import {
  nestAdminAiOpenAiUrl,
  nestAdminHealthCheck,
  nestAdminAiChatSettingsUpdate,
  nestAdminOpenAiSettings,
  nestAdminOpenAiTest,
  nestAdminOpenAiUpdateSettings,
  type NestAdminAiApiError,
  type NestAdminAiOpenAiDiagnostics,
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

type ConfigDraft = Pick<
  NestAdminAiSettingsView,
  | 'enabled'
  | 'defaultModel'
  | 'dailyRequestLimit'
  | 'monthlyBudgetCzk'
  | 'maxOutputTokens'
  | 'timeoutMs'
  | 'seoEnabled'
  | 'listingDescriptionEnabled'
  | 'socialPostEnabled'
  | 'emailEnabled'
  | 'supportEnabled'
  | 'chatEnabled'
  | 'publicChatEnabled'
  | 'testModeEnabled'
>;

function draftFromSettings(settings: NestAdminAiSettingsView): ConfigDraft {
  return {
    enabled: settings.enabled,
    defaultModel: settings.defaultModel,
    dailyRequestLimit: settings.dailyRequestLimit,
    monthlyBudgetCzk: settings.monthlyBudgetCzk,
    maxOutputTokens: settings.maxOutputTokens,
    timeoutMs: settings.timeoutMs,
    seoEnabled: settings.seoEnabled,
    listingDescriptionEnabled: settings.listingDescriptionEnabled,
    socialPostEnabled: settings.socialPostEnabled,
    emailEnabled: settings.emailEnabled,
    supportEnabled: settings.supportEnabled,
    chatEnabled: settings.chatEnabled,
    publicChatEnabled: settings.publicChatEnabled,
    testModeEnabled: settings.testModeEnabled,
  };
}

function draftsEqual(a: ConfigDraft, b: ConfigDraft): boolean {
  return (Object.keys(a) as (keyof ConfigDraft)[]).every((key) => a[key] === b[key]);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xl font-bold text-zinc-900">{value}</p>
      <p className="text-sm text-zinc-600">{label}</p>
    </div>
  );
}

function yesNo(value: boolean | undefined): string {
  return value ? 'Ano' : 'Ne';
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
  const [diagnostics, setDiagnostics] = useState<NestAdminAiOpenAiDiagnostics | null>(null);
  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<ConfigDraft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<'ok' | 'err' | 'info'>('info');
  const [busy, setBusy] = useState(false);
  const [healthMsg, setHealthMsg] = useState<string | null>(null);
  const [lastSaveStatus, setLastSaveStatus] = useState<number | null>(null);

  const applyLoadedData = useCallback((settingsData: NestAdminAiSettingsResponse) => {
    setData(settingsData);
    setStatus(settingsData.status);
    setUsage(settingsData.usage ?? EMPTY_USAGE);
    setDiagnostics(settingsData.diagnostics ?? null);
    const nextDraft = draftFromSettings(settingsData.settings);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
  }, []);

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
      applyLoadedData(settingsData);
    } catch (e) {
      console.error('AI centrum load error:', e);
      const err = e as NestAdminAiApiError;
      setError(err.message || 'AI centrum se nepodařilo načíst.');
      setHttpStatus(err.httpStatus ?? null);
      if (err.requestUrl) setRequestUrl(err.requestUrl);
    } finally {
      setLoading(false);
    }
  }, [token, applyLoadedData]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (!isLoading && token && user?.role === 'ADMIN') {
      void loadAiSettings();
    }
  }, [isLoading, token, user, loadAiSettings]);

  const dirty = useMemo(() => {
    if (!draft || !savedDraft) return false;
    return !draftsEqual(draft, savedDraft);
  }, [draft, savedDraft]);

  function patchDraft(patch: Partial<ConfigDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setMsg(null);
  }

  async function saveConfig() {
    if (!token || !draft || !savedDraft) return;
    setBusy(true);
    setMsg(null);
    setLastSaveStatus(null);

    const openAiPatch: Partial<NestAdminAiSettingsView> = {};
    const chatPatch: {
      chatEnabled?: boolean;
      publicChatEnabled?: boolean;
      testModeEnabled?: boolean;
    } = {};

    (Object.keys(draft) as (keyof ConfigDraft)[]).forEach((key) => {
      if (draft[key] === savedDraft[key]) return;
      if (key === 'chatEnabled' || key === 'publicChatEnabled' || key === 'testModeEnabled') {
        chatPatch[key] = draft[key] as boolean;
      } else {
        (openAiPatch as Record<string, unknown>)[key] = draft[key];
      }
    });

    try {
      if (Object.keys(openAiPatch).length > 0) {
        const updated = await nestAdminOpenAiUpdateSettings(token, openAiPatch);
        applyLoadedData(updated);
        setLastSaveStatus(200);
      }
      if (Object.keys(chatPatch).length > 0) {
        await nestAdminAiChatSettingsUpdate(token, chatPatch);
        await loadAiSettings();
        setLastSaveStatus(200);
      }
      if (Object.keys(openAiPatch).length === 0 && Object.keys(chatPatch).length === 0) {
        setMsgTone('info');
        setMsg('Žádné změny k uložení.');
        return;
      }
      setMsgTone('ok');
      setMsg('✓ Nastavení uloženo');
    } catch (e) {
      const err = e as NestAdminAiApiError;
      setMsgTone('err');
      setLastSaveStatus(err.httpStatus ?? null);
      setMsg(
        `✕ Nastavení se nepodařilo uložit${err.httpStatus ? ` (HTTP ${err.httpStatus})` : ''}: ${
          err.message ?? (e instanceof Error ? e.message : 'Neznámá chyba')
        }`,
      );
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
      setMsgTone(res.success ? 'ok' : 'err');
      setMsg(res.message);
      await loadAiSettings();
    } catch (e) {
      setMsgTone('err');
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
  const dbEnabled = draft?.enabled ?? settings?.dbEnabled ?? settings?.enabled ?? false;
  const envEnabled = settings?.envEnabled ?? displayStatus?.envEnabled ?? false;
  const canonicalEnabled =
    settings?.canonicalEnabled ??
    displayStatus?.enabled ??
    (dbEnabled || envEnabled);
  const connectedLabel = !displayStatus?.apiKeyConfigured
    ? 'Nepřipojeno'
    : displayStatus.connected === true
      ? 'Připojeno'
      : displayStatus.connected === false
        ? 'Test selhal'
        : 'Nekonfigurováno / netestováno';

  const msgClass =
    msgTone === 'ok'
      ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
      : msgTone === 'err'
        ? 'border border-red-200 bg-red-50 text-red-900'
        : 'bg-zinc-100 text-zinc-800';

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        Centrální OpenAI integrace pro SEO, popisy, e-maily,{' '}
        <a href="/admin/marketing/ai-chat" className="font-semibold text-orange-600 underline">
          veřejný AI chat
        </a>{' '}
        a{' '}
        <a href="/admin/marketing/ai-sales" className="font-semibold text-orange-600 underline">
          AI obchodník →
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

      {msg ? <p className={`mb-4 rounded-lg px-4 py-2 text-sm ${msgClass}`}>{msg}</p> : null}
      {healthMsg ? <p className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-900">{healthMsg}</p> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
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
        {dirty ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            Neuložené změny
          </span>
        ) : savedDraft ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
            Uloženo
          </span>
        ) : null}
      </div>

      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Připojení OpenAI</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Stav" value={connectedLabel} />
          <Stat label="AI zapnuta (DB)" value={yesNo(dbEnabled)} />
          <Stat label="API klíč nastaven" value={yesNo(displayStatus?.apiKeyConfigured)} />
          <Stat label="Model" value={displayStatus?.model ?? settings?.defaultModel ?? '—'} />
        </div>
        <div className="mt-4 space-y-1 text-sm text-zinc-600">
          <p>
            Runtime aktivní (DB nebo OPENAI_ENABLED):{' '}
            <strong>{yesNo(canonicalEnabled)}</strong>
            {envEnabled && !dbEnabled ? (
              <span className="ml-2 text-amber-700">
                — běží přes env proměnnou, uložte zapnutí v DB pro trvalý stav
              </span>
            ) : null}
          </p>
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

      {settings && draft ? (
        <>
          <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Konfigurace</h2>
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={() => void saveConfig()}
                className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Ukládám…' : 'Uložit konfiguraci'}
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => patchDraft({ enabled: e.target.checked })}
                  disabled={busy}
                />
                Povolit OpenAI
              </label>
              <div>
                <label className="mb-1 block text-sm font-medium">Model</label>
                <select
                  value={draft.defaultModel}
                  onChange={(e) => patchDraft({ defaultModel: e.target.value })}
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
                  value={draft.dailyRequestLimit}
                  onChange={(e) => patchDraft({ dailyRequestLimit: Number(e.target.value) })}
                  disabled={busy}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Měsíční rozpočet (Kč)</label>
                <input
                  type="number"
                  value={draft.monthlyBudgetCzk}
                  onChange={(e) => patchDraft({ monthlyBudgetCzk: Number(e.target.value) })}
                  disabled={busy}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Max. délka výstupu (tokeny)</label>
                <input
                  type="number"
                  value={draft.maxOutputTokens}
                  onChange={(e) => patchDraft({ maxOutputTokens: Number(e.target.value) })}
                  disabled={busy}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Timeout (ms)</label>
                <input
                  type="number"
                  value={draft.timeoutMs}
                  onChange={(e) => patchDraft({ timeoutMs: Number(e.target.value) })}
                  disabled={busy}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold">AI chat a funkce</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['chatEnabled', 'Povolit AI chat'],
                  ['publicChatEnabled', 'Povolit veřejný chat'],
                  ['testModeEnabled', 'Povolit testovací chat'],
                  ['supportEnabled', 'Povolit AI podporu'],
                  ['seoEnabled', 'Povolit AI SEO'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(draft[key])}
                    onChange={(e) => patchDraft({ [key]: e.target.checked })}
                    disabled={busy}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Testovací chat v administraci vyžaduje pouze globální OpenAI a testovací režim — veřejný chat může být vypnutý.
            </p>
          </section>

          <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold">Ostatní AI funkce</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['listingDescriptionEnabled', 'Popisy inzerátů'],
                  ['socialPostEnabled', 'Sociální příspěvky'],
                  ['emailEnabled', 'E-maily'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft[key]}
                    onChange={(e) => patchDraft({ [key]: e.target.checked })}
                    disabled={busy}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-2 text-lg font-semibold">OPENAI CONFIG — diagnostika</h2>
            <p className="mb-4 text-xs text-zinc-500">Interní stav bez citlivých hodnot (API klíč se nezobrazuje).</p>
            <div className="grid gap-2 font-mono text-xs sm:grid-cols-2">
              <p>API key: {diagnostics?.apiKey ?? (displayStatus?.apiKeyConfigured ? 'CONFIGURED' : 'MISSING')}</p>
              <p>Enabled DB: {diagnostics?.dbEnabled ?? (dbEnabled ? 'YES' : 'NO')}</p>
              <p>Enabled env: {diagnostics?.envEnabled ?? (envEnabled ? 'YES' : 'NO')}</p>
              <p>Enabled canonical: {diagnostics?.canonicalEnabled ?? (canonicalEnabled ? 'YES' : 'NO')}</p>
              <p>Usable: {diagnostics?.usable ?? '—'}</p>
              <p>Model: {diagnostics?.model ?? settings.defaultModel}</p>
              <p>Config source: {diagnostics?.configSource ?? '—'}</p>
              <p>Config GET: {diagnostics?.configGet ?? 'PASS'}</p>
              <p>
                Config UPDATE:{' '}
                {lastSaveStatus != null
                  ? lastSaveStatus >= 200 && lastSaveStatus < 300
                    ? 'PASS'
                    : 'FAIL'
                  : diagnostics?.configUpdate ?? '—'}
              </p>
              <p>Worker sees same config: {diagnostics?.workerSeesSameConfig ?? 'YES'}</p>
              <p>API endpoint: {displayStatus?.apiKeyConfigured ? 'PASS' : 'FAIL'}</p>
              {diagnostics?.resolvedAt ? <p className="sm:col-span-2">Resolved: {diagnostics.resolvedAt}</p> : null}
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
