'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

type Stats = {
  shown: number;
  opened: number;
  searches: number;
  clicks: number;
  watches: number;
  leads?: number;
  conversionRate: number;
  clickRate: number;
};

type LeadRow = {
  id: string;
  email: string;
  status: string;
  initialQuery: string | null;
  locationLabel: string | null;
  budgetMax: number | null;
  propertyTypeLabel: string | null;
  sourcePage: string | null;
  resultsCount: number | null;
  marketingConsent: boolean;
  createdAt: string;
};

type Settings = {
  enabled: boolean;
  popupDelaySec: number;
  popupScrollPercent: number;
  popupOnInteraction: boolean;
  popupAsCtaOnly: boolean;
  externalDiscoveryEnabled: boolean;
  cacheTtlMinutes: number;
  minMatchScore: number;
};

async function adminFetch<T>(token: string, path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${API_BASE_URL}/admin/ai-property-finder${path}`, {
    ...init,
    headers: {
      ...nestAuthHeaders(token),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export default function AiPropertyFinderAdminPage() {
  const { apiAccessToken } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; configured: boolean; envHint?: string }>>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);

  const load = useCallback(async () => {
    if (!apiAccessToken) return;
    const [s, cfg, prov, leadRes] = await Promise.all([
      adminFetch<Stats>(apiAccessToken, '/stats?days=30'),
      adminFetch<Settings>(apiAccessToken, '/settings'),
      adminFetch<{ providers: typeof providers }>(apiAccessToken, '/providers'),
      adminFetch<{ items: LeadRow[] }>(apiAccessToken, '/leads?limit=40'),
    ]);
    setStats(s);
    setSettings(cfg);
    setProviders(prov?.providers ?? []);
    setLeads(leadRes?.items ?? []);
  }, [apiAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link href="/admin/marketing/ai-centrum" className="text-sm text-orange-600 underline">
          ← AI centrum
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">AI Hledač nemovitostí</h1>
        <p className="text-sm text-zinc-600">Programatické SEO stránky · vyhledávání XXREALIT + povolené externí zdroje</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Zobrazení', stats?.shown ?? 0],
          ['Použití (otevření)', stats?.opened ?? 0],
          ['Vyhledávání', stats?.searches ?? 0],
          ['Kliknutí', stats?.clicks ?? 0],
          ['Hlídání', stats?.watches ?? 0],
          ['Leady (AI hledač)', stats?.leads ?? 0],
          ['Konverze hledání', `${stats?.conversionRate ?? 0} %`],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-xl font-bold text-zinc-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold text-zinc-900">Zdroje</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {providers.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2">
              <span>{p.name}</span>
              <span className={p.configured ? 'text-emerald-700' : 'text-amber-700'}>
                {p.configured ? '✓ aktivní' : '⚠ není nakonfigurováno'}
                {p.envHint ? ` · ${p.envHint}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold text-zinc-900">Leady · AI_PROPERTY_FINDER</h2>
        <p className="mt-1 text-xs text-zinc-500">E-mail získaný před zobrazením výsledků AI hledání na SEO stránkách.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b text-zinc-500">
                <th className="py-2 pr-3">E-mail</th>
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3">Dotaz</th>
                <th className="py-2 pr-3">Lokalita</th>
                <th className="py-2 pr-3">Rozpočet</th>
                <th className="py-2 pr-3">Typ</th>
                <th className="py-2 pr-3">SEO stránka</th>
                <th className="py-2 pr-3">Výsledků</th>
                <th className="py-2 pr-3">Marketing</th>
                <th className="py-2">Stav</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 font-medium text-zinc-900">{row.email}</td>
                  <td className="py-2 pr-3">{new Date(row.createdAt).toLocaleString('cs-CZ')}</td>
                  <td className="max-w-[200px] truncate py-2 pr-3" title={row.initialQuery ?? ''}>
                    {row.initialQuery ?? '—'}
                  </td>
                  <td className="py-2 pr-3">{row.locationLabel ?? '—'}</td>
                  <td className="py-2 pr-3">{row.budgetMax ? `${row.budgetMax.toLocaleString('cs-CZ')} Kč` : '—'}</td>
                  <td className="py-2 pr-3">{row.propertyTypeLabel ?? '—'}</td>
                  <td className="py-2 pr-3">{row.sourcePage ?? '—'}</td>
                  <td className="py-2 pr-3">{row.resultsCount ?? '—'}</td>
                  <td className="py-2 pr-3">{row.marketingConsent ? 'ano' : 'ne'}</td>
                  <td className="py-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leads.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Zatím žádné leady.</p> : null}
        </div>
      </section>

      {settings ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold text-zinc-900">Nastavení</h2>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) =>
                  void adminFetch(apiAccessToken!, '/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({ enabled: e.target.checked }),
                  }).then(load)
                }
              />
              AI Finder enabled
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.externalDiscoveryEnabled}
                onChange={(e) =>
                  void adminFetch(apiAccessToken!, '/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({ externalDiscoveryEnabled: e.target.checked }),
                  }).then(load)
                }
              />
              Externí discovery
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.popupAsCtaOnly}
                onChange={(e) =>
                  void adminFetch(apiAccessToken!, '/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({ popupAsCtaOnly: e.target.checked }),
                  }).then(load)
                }
              />
              Pouze CTA (bez auto popup)
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-zinc-600">
              Delay (s)
              <input
                type="number"
                defaultValue={settings.popupDelaySec}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                onBlur={(e) =>
                  void adminFetch(apiAccessToken!, '/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({ popupDelaySec: Number(e.target.value) || 8 }),
                  }).then(load)
                }
              />
            </label>
            <label className="text-xs text-zinc-600">
              Scroll %
              <input
                type="number"
                defaultValue={settings.popupScrollPercent}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                onBlur={(e) =>
                  void adminFetch(apiAccessToken!, '/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({ popupScrollPercent: Number(e.target.value) || 30 }),
                  }).then(load)
                }
              />
            </label>
            <label className="text-xs text-zinc-600">
              Min match score
              <input
                type="number"
                defaultValue={settings.minMatchScore}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                onBlur={(e) =>
                  void adminFetch(apiAccessToken!, '/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({ minMatchScore: Number(e.target.value) || 40 }),
                  }).then(load)
                }
              />
            </label>
          </div>
        </section>
      ) : null}
    </div>
  );
}
