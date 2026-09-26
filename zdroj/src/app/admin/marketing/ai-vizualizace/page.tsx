'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import { getAuthHeaders } from '@/lib/nest-client';

import { fetchAdminRenovationRequests } from '@/lib/ai-visualization-client';

type Stats = {
  days: number;
  total: number;
  completed: number;
  failed: number;
  anonymousCompleted: number;
  loggedInCompleted: number;
  downloads: number;
  shares: number;
  estimatedCostCzkSum: number | null;
  estimatedCostCzkConfigured: number | null;
};

type Settings = {
  enabled: boolean;
  anonymousEnabled: boolean;
  anonymousFreeGenerations: number;
  loggedInFreeGenerations: number;
  maxUploadBytes: number;
  provider: string;
  model: string;
  outputQuality: string;
  originalRetentionDays: number;
  resultRetentionDays: number;
  watermarkEnabled: boolean;
  watermarkPosition: string;
  watermarkOnDownload: boolean;
  estimatedCostCzkPerGeneration: number | null;
};

type RenovationRequestRow = {
  id: string;
  publicId: string;
  email: string;
  location: string | null;
  propertyType: string | null;
  status: string;
  budgetMin: number | null;
  budgetMax: number | null;
  companiesCount: number;
  responsesCount: number;
  createdAt: string;
};

export default function AdminAiVizualizacePage() {
  const { apiAccessToken } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [renovationRequests, setRenovationRequests] = useState<RenovationRequestRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!API_BASE_URL) return;
    const h = getAuthHeaders();
    const [sRes, stRes, ren] = await Promise.all([
      fetch(`${API_BASE_URL}/admin/ai-visualization/stats`, { headers: h }),
      fetch(`${API_BASE_URL}/admin/ai-visualization/settings`, { headers: h }),
      fetchAdminRenovationRequests(),
    ]);
    if (sRes.ok) setStats((await sRes.json()) as Stats);
    if (stRes.ok) setSettings((await stRes.json()) as Settings);
    if (ren?.items) setRenovationRequests(ren.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load, apiAccessToken]);

  async function saveSettings() {
    if (!settings || !API_BASE_URL) return;
    const res = await fetch(`${API_BASE_URL}/admin/ai-visualization/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(settings),
    });
    setMsg(res.ok ? 'Uloženo.' : 'Uložení se nepodařilo.');
    void load();
  }

  return (
    <div className="max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">AI vizualizace</h1>
        <p className="mt-1 text-sm text-zinc-600">Rekonstrukce interiérů a exteriérů — statistiky a limity.</p>
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="Dnes / 30 dní celkem" value={String(stats.total)} />
          <Stat label="Dokončené" value={String(stats.completed)} />
          <Stat label="Anonymní dokončené" value={String(stats.anonymousCompleted)} />
          <Stat label="Přihlášení dokončené" value={String(stats.loggedInCompleted)} />
          <Stat label="Stažení" value={String(stats.downloads)} />
          <Stat label="Sdílení" value={String(stats.shares)} />
          <Stat label="Chyby" value={String(stats.failed)} />
          <Stat
            label="Odhad nákladů (součet / ks)"
            value={`${stats.estimatedCostCzkSum ?? '—'} Kč · ${stats.estimatedCostCzkConfigured ?? '—'} Kč/ks`}
          />
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold text-zinc-900">Poptávky rekonstrukcí</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b text-zinc-500">
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3">E-mail</th>
                <th className="py-2 pr-3">Lokalita</th>
                <th className="py-2 pr-3">Typ</th>
                <th className="py-2 pr-3">AI odhad</th>
                <th className="py-2 pr-3">Firmy</th>
                <th className="py-2 pr-3">Reakce</th>
                <th className="py-2">Stav</th>
              </tr>
            </thead>
            <tbody>
              {renovationRequests.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('cs-CZ')}</td>
                  <td className="py-2 pr-3">{r.email}</td>
                  <td className="py-2 pr-3">{r.location ?? '—'}</td>
                  <td className="py-2 pr-3">{r.propertyType ?? '—'}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {r.budgetMin != null && r.budgetMax != null ? `${r.budgetMin}–${r.budgetMax} Kč` : '—'}
                  </td>
                  <td className="py-2 pr-3">{r.companiesCount}</td>
                  <td className="py-2 pr-3">{r.responsesCount}</td>
                  <td className="py-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {renovationRequests.length === 0 ? (
            <p className="py-4 text-sm text-zinc-500">Zatím žádné poptávky.</p>
          ) : null}
        </div>
      </div>

      {settings ? (
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold text-zinc-900">Nastavení</h2>
          <Toggle label="AI vizualizace zapnuta" checked={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} />
          <Toggle
            label="Anonymní generování"
            checked={settings.anonymousEnabled}
            onChange={(v) => setSettings({ ...settings, anonymousEnabled: v })}
          />
          <Field label="Anonymní generování / den" value={settings.anonymousFreeGenerations} onChange={(v) => setSettings({ ...settings, anonymousFreeGenerations: v })} />
          <Field label="Přihlášený / den" value={settings.loggedInFreeGenerations} onChange={(v) => setSettings({ ...settings, loggedInFreeGenerations: v })} />
          <Field label="Max. velikost (B)" value={settings.maxUploadBytes} onChange={(v) => setSettings({ ...settings, maxUploadBytes: v })} />
          <label className="block text-sm">
            Provider
            <input className="mt-1 w-full rounded border px-2 py-1" value={settings.provider} onChange={(e) => setSettings({ ...settings, provider: e.target.value })} />
          </label>
          <label className="block text-sm">
            Model
            <input className="mt-1 w-full rounded border px-2 py-1" value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} />
          </label>
          <Field
            label="Odhad Kč / generování"
            value={settings.estimatedCostCzkPerGeneration ?? 0}
            onChange={(v) => setSettings({ ...settings, estimatedCostCzkPerGeneration: v })}
          />
          <Toggle label="Watermark preview" checked={settings.watermarkEnabled} onChange={(v) => setSettings({ ...settings, watermarkEnabled: v })} />
          <button type="button" onClick={() => void saveSettings()} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white">
            Uložit
          </button>
          {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-900">{value}</p>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type="number"
        className="mt-1 w-full rounded border px-2 py-1"
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || 0)}
      />
    </label>
  );
}
