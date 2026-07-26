'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminOpenAiSettings,
  nestAdminOpenAiTest,
  nestAdminOpenAiUpdateSettings,
  type AiSettingsResponse,
  type AiSettingsView,
} from '@/lib/ai-admin-api';

const MODELS = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'];

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
  const [data, setData] = useState<AiSettingsResponse | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await nestAdminOpenAiSettings(token);
    setData(res);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save(patch: Partial<AiSettingsView>) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      await nestAdminOpenAiUpdateSettings(token, patch);
      await refresh();
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
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Test selhal');
    } finally {
      setBusy(false);
    }
  }

  if (!token || user?.role !== 'ADMIN') return null;
  if (!data) return <p className="text-sm text-zinc-500">Načítám AI centrum…</p>;

  const { settings, env, usage, status } = data;
  const connectedLabel = status.configured
    ? status.connected
      ? 'Připojeno'
      : 'Nakonfigurováno, netestováno'
    : 'Nepřipojeno';

  return (
    <>
      <p className="mb-6 text-sm text-zinc-600">
        Centrální správa OpenAI pro portál XXREALIT. Veškerá komunikace probíhá přes backend — API klíč není
        dostupný ve frontendu.
      </p>

      {msg ? <p className="mb-4 rounded-lg bg-zinc-100 px-4 py-2 text-sm">{msg}</p> : null}

      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Stav OpenAI</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Stav" value={connectedLabel} />
          <Stat label="AI zapnuta" value={settings.enabled ? 'Ano' : 'Ne'} />
          <Stat label="API klíč" value={env.apiKeyConfigured ? 'Nakonfigurován' : 'Chybí'} />
          <Stat label="Model" value={settings.defaultModel} />
        </div>
        <div className="mt-4 space-y-1 text-sm text-zinc-600">
          {env.apiKeyMasked ? <p>Maskovaný klíč: {env.apiKeyMasked}</p> : <p>{status.message ?? 'OpenAI není připojeno.'}</p>}
          <p>{env.apiKeyHelp}</p>
          {settings.lastConnectionTestAt ? (
            <p>
              Poslední test: {new Date(settings.lastConnectionTestAt).toLocaleString('cs-CZ')}
              {settings.lastConnectionSuccess ? ' — úspěch' : ' — chyba'}
            </p>
          ) : null}
          {settings.lastConnectionError ? (
            <p className="text-red-600">Poslední chyba: {settings.lastConnectionError}</p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy || !env.apiKeyConfigured}
          onClick={() => void testConnection()}
          className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Testuji…' : 'Otestovat připojení'}
        </button>
      </section>

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
              ['supportEnabled', 'Zákaznická podpora'],
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
