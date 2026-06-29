'use client';

import { useState } from 'react';
import {
  nestAdminSrealityPrefillDebug,
  type SrealityPrefillDebugResult,
} from '@/lib/nest-client';

type Props = {
  token: string;
};

export function SrealityPrefillDebugPanel({ token }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SrealityPrefillDebugResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDebug() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Zadejte URL inzerátu ze Sreality.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    const r = await nestAdminSrealityPrefillDebug(token, trimmed);
    setLoading(false);
    if (!r.ok) {
      setError(r.error ?? 'Debug import selhal.');
      if (r.data) setResult(r.data);
      return;
    }
    setResult(r.data ?? null);
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">Sreality prefill — debug mód</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Otestuje Playwright načtení stránky a všechny parsery. Zobrazí konkrétní důvod selhání.
        Pokud selže na COOKIE_CONSENT, nastavte na serveru{' '}
        <code className="rounded bg-zinc-100 px-1">SREALITY_PLAYWRIGHT_STORAGE_STATE_PATH</code> (soubor
        z Playwright po ručním odsouhlasení cookies).
      </p>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end">
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-xs text-zinc-600">URL inzerátu</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.sreality.cz/detail/..."
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={() => void runDebug()}
          disabled={loading}
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Testuji…' : 'Spustit debug'}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3 text-sm">
          <p
            className={`rounded-xl border px-4 py-3 ${
              result.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-950'
            }`}
          >
            {result.ok ? 'Import úspěšný' : 'Import selhal'}
            {result.error ? ` — ${result.error}` : ''}
          </p>

          {result.log ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <h3 className="mb-2 font-semibold text-zinc-800">Log</h3>
              <dl className="grid gap-1 sm:grid-cols-2">
                {Object.entries(result.log).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="shrink-0 font-medium text-zinc-600">{key}:</dt>
                    <dd className="break-all text-zinc-900">
                      {Array.isArray(value) ? value.join(', ') || '—' : String(value ?? '—')}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {result.debug ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <h3 className="mb-2 font-semibold text-zinc-800">Parsery</h3>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-zinc-800">
                {JSON.stringify(result.debug, null, 2)}
              </pre>
            </div>
          ) : null}

          {result.data ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <h3 className="mb-2 font-semibold text-zinc-800">Načtená data</h3>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-zinc-800">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
