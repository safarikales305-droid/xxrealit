'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminBulkDisableImported,
  nestAdminImportLogs,
  nestAdminImportSources,
  nestAdminRunImportSource,
  nestAdminUpdateImportSource,
  type AdminImportLogRow,
  type AdminImportSourceRow,
} from '@/lib/nest-client';

const SOURCE_OPTIONS = [
  { value: 'reality_cz', label: 'Reality.cz' },
  { value: 'xml_feed', label: 'XML feed' },
  { value: 'csv_feed', label: 'CSV' },
  { value: 'other', label: 'Jiný zdroj' },
] as const;

const METHOD_OPTIONS = [
  { value: 'soap', label: 'Reality.cz SOAP' },
  { value: 'scraper', label: 'Reality.cz Scraper' },
  { value: 'xml', label: 'XML feed' },
  { value: 'csv', label: 'CSV' },
  { value: 'other', label: 'Další' },
] as const;

function readSettingsNumber(v: unknown, fallback: number): number {
  const x =
    typeof v === 'number' && Number.isFinite(v)
      ? v
      : typeof v === 'string'
        ? Number.parseFloat(v)
        : fallback;
  return Number.isFinite(x) ? Math.trunc(x) : fallback;
}

function readSettingsFloat(v: unknown, fallback: number): number {
  const x =
    typeof v === 'number' && Number.isFinite(v)
      ? v
      : typeof v === 'string'
        ? Number.parseFloat(v)
        : fallback;
  return Number.isFinite(x) ? x : fallback;
}

type ImportSourceFormState = {
  intervalMinutes: number;
  limitPerRun: number;
  endpointUrl: string;
  scraperRequestDelayMs: number;
  scraperMaxRetries: number;
  scraperBackoffMultiplier: number;
  scraperBaseBackoffMsOn429: number;
  scraperMaxDetailFetchesPerRun: number;
  scraperListOnlyImport: boolean;
};

export default function AdminImportsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [sources, setSources] = useState<AdminImportSourceRow[]>([]);
  const [logs, setLogs] = useState<AdminImportLogRow[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);
  const [sourceForm, setSourceForm] = useState<ImportSourceFormState>({
    intervalMinutes: 60,
    limitPerRun: 100,
    endpointUrl: '',
    scraperRequestDelayMs: 3500,
    scraperMaxRetries: 6,
    scraperBackoffMultiplier: 2,
    scraperBaseBackoffMsOn429: 12_000,
    scraperMaxDetailFetchesPerRun: 0,
    scraperListOnlyImport: true,
  });
  const [bulkSource, setBulkSource] = useState<string>('reality_cz');
  const [bulkMethod, setBulkMethod] = useState<string>('');

  const selectedSource = useMemo(
    () => sources.find((x) => x.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  useEffect(() => {
    if (!selectedSource) return;
    const sj = (selectedSource.settingsJson ?? {}) as Record<string, unknown>;
    setSourceForm({
      intervalMinutes: selectedSource.intervalMinutes,
      limitPerRun: selectedSource.limitPerRun,
      endpointUrl: selectedSource.endpointUrl ?? '',
      scraperRequestDelayMs: readSettingsNumber(sj.scraperRequestDelayMs, 3500),
      scraperMaxRetries: readSettingsNumber(sj.scraperMaxRetries, 6),
      scraperBackoffMultiplier: Math.min(
        4,
        Math.max(1.25, readSettingsFloat(sj.scraperBackoffMultiplier, 2)),
      ),
      scraperBaseBackoffMsOn429: readSettingsNumber(sj.scraperBaseBackoffMsOn429, 12_000),
      scraperMaxDetailFetchesPerRun: readSettingsNumber(sj.scraperMaxDetailFetchesPerRun, 0),
      scraperListOnlyImport:
        typeof sj.scraperListOnlyImport === 'boolean' ? sj.scraperListOnlyImport : true,
    });
  }, [
    selectedSource?.id,
    selectedSource?.updatedAt,
    selectedSource?.intervalMinutes,
    selectedSource?.limitPerRun,
    selectedSource?.endpointUrl,
    selectedSource?.settingsJson,
  ]);

  function scraperSettingsPayload(
    base: AdminImportSourceRow,
    f: ImportSourceFormState,
  ): Record<string, unknown> {
    const prev =
      base.settingsJson && typeof base.settingsJson === 'object' && !Array.isArray(base.settingsJson)
        ? { ...(base.settingsJson as Record<string, unknown>) }
        : {};
    return {
      ...prev,
      scraperRequestDelayMs: f.scraperRequestDelayMs,
      scraperMaxRetries: f.scraperMaxRetries,
      scraperBackoffMultiplier: f.scraperBackoffMultiplier,
      scraperBaseBackoffMsOn429: f.scraperBaseBackoffMsOn429,
      scraperMaxDetailFetchesPerRun: f.scraperListOnlyImport ? 0 : f.scraperMaxDetailFetchesPerRun,
      scraperListOnlyImport: f.scraperListOnlyImport,
    };
  }

  async function refresh(sourceId?: string) {
    if (!token) return;
    setError(null);
    const [s, l] = await Promise.all([
      nestAdminImportSources(token),
      nestAdminImportLogs(token, sourceId),
    ]);
    if (!s) {
      setError('Nepodařilo se načíst import sources.');
      return;
    }
    setSources(s);
    if (!selectedSourceId && s[0]) {
      setSelectedSourceId(s[0].id);
    }
    setLogs(l ?? []);
  }

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

  async function saveSourcePatch(sourceId: string, patch: Record<string, unknown>) {
    if (!token) return;
    setBusyId(sourceId);
    setStatusMsg(null);
    setError(null);
    setWarnMsg(null);
    const r = await nestAdminUpdateImportSource(token, sourceId, patch);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error ?? 'Uložení source selhalo');
      return;
    }
    setStatusMsg('Nastavení importu uloženo.');
    await refresh(selectedSourceId || sourceId);
  }

  async function runSource(sourceId: string) {
    if (!token) return;
    const src = sources.find((s) => s.id === sourceId);
    const isRealityScraper =
      src?.portal === 'reality_cz' && src?.method === 'scraper';
    const endpointForRun =
      src?.id === selectedSourceId
        ? sourceForm.endpointUrl.trim()
        : (src?.endpointUrl ?? '').trim();
    if (isRealityScraper && !endpointForRun) {
      setError(
        'Zadejte start URL pro scraper Reality.cz do pole „Endpoint / start URL“ a nechte ho uložit (klik mimo pole nebo upravte hodnotu).',
      );
      setWarnMsg(null);
      setStatusMsg(null);
      return;
    }
    setBusyId(sourceId);
    setStatusMsg(null);
    setError(null);
    setWarnMsg(null);
    const r = await nestAdminRunImportSource(token, sourceId);
    setBusyId(null);
    if (!r.ok) {
      const err = r.error ?? 'Spuštění importu selhalo';
      if (/429|Too Many Requests|blokuje příliš rychlé/i.test(err)) {
        setError(
          'Web Reality.cz blokuje příliš rychlé dotazy (HTTP 429). Zpomalte scraper: zvětšete „Prodleva mezi požadavky (ms)“, případně snižte „Max. detailních stránek na běh“ a nechte zapnuté „Jen výpis (bez detailů)“.',
        );
      } else {
        setError(err);
      }
      return;
    }
    const n = Number(r.data?.importedNew ?? 0);
    const u = Number(r.data?.importedUpdated ?? 0);
    const d = Number(r.data?.disabled ?? 0);
    const sk = Number(r.data?.skipped ?? 0);
    const warnings = Array.isArray(r.data?.warnings) ? r.data.warnings.filter((x): x is string => typeof x === 'string') : [];
    const summary = typeof r.data?.summary === 'string' ? r.data.summary.trim() : '';
    const noDbChanges = n === 0 && u === 0;
    if (warnings.length && noDbChanges) {
      setWarnMsg(warnings.join('\n\n'));
      setStatusMsg(
        summary ||
          `Import doběhl bez nových a aktualizovaných záznamů (přeskočeno ${sk}, ručně vypnuté přeskočeno ${d}). Podrobnosti viz varování níže a záložka logů.`,
      );
    } else if (warnings.length) {
      setWarnMsg(warnings.join('\n\n'));
      setStatusMsg(
        summary ||
          `Import dokončen: nové ${n}, aktualizované ${u}, přeskočeno ${sk}, ručně vypnuté přeskočeno ${d}.`,
      );
    } else {
      setStatusMsg(
        summary ||
          `Import dokončen: nové ${n}, aktualizované ${u}, přeskočeno ${sk}, ručně vypnuté přeskočeno ${d}.`,
      );
    }
    await refresh(selectedSourceId || sourceId);
  }

  async function bulkDisable() {
    if (!token) return;
    const confirmText =
      bulkMethod.trim()
        ? `Vypnout všechny inzeráty source=${bulkSource}, method=${bulkMethod}?`
        : `Vypnout všechny inzeráty source=${bulkSource}?`;
    if (!window.confirm(confirmText)) return;
    setError(null);
    setStatusMsg(null);
    const r = await nestAdminBulkDisableImported(token, {
      source: bulkSource,
      method: bulkMethod || undefined,
    });
    if (!r.ok) {
      setError(r.error ?? 'Hromadné vypnutí selhalo');
      return;
    }
    setStatusMsg(`Hromadně vypnuto ${r.affected ?? 0} inzerátů.`);
    await refresh(selectedSourceId);
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">Načítání…</div>;
  }
  if (!token || !user || user.role !== 'ADMIN') return null;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold">Importy</h1>
            <p className="text-sm text-zinc-600">Správa zdrojů (SOAP, Scraper, XML, CSV), ruční běhy a logy.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">Admin</Link>
            <Link href="/admin/inzeraty" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">Inzeráty</Link>
          </div>
        </header>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {statusMsg ? (
          <p
            className={`rounded-xl border px-4 py-3 text-sm ${
              warnMsg
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {statusMsg}
          </p>
        ) : null}
        {warnMsg ? (
          <pre className="whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">{warnMsg}</pre>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Importní zdroje</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {sources.map((src) => (
              <article key={src.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSourceId(src.id)}
                    className={`text-left text-sm font-semibold ${selectedSourceId === src.id ? 'text-[#e85d00]' : 'text-zinc-900'}`}
                  >
                    {src.name}
                  </button>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{src.portal} / {src.method}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={src.enabled} onChange={(e) => void saveSourcePatch(src.id, { enabled: e.target.checked })} disabled={busyId === src.id} />
                    Enabled
                  </label>
                  <button
                    type="button"
                    onClick={() => void runSource(src.id)}
                    disabled={busyId === src.id}
                    className="rounded-md bg-zinc-900 px-2 py-1 text-white"
                  >
                    Spustit
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {selectedSource ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">Nastavení: {selectedSource.name}</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Interval (min)</span>
                <input
                  value={sourceForm.intervalMinutes}
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                  onChange={(e) =>
                    setSourceForm((f) => ({
                      ...f,
                      intervalMinutes: Number.parseInt(e.target.value, 10) || 1,
                    }))
                  }
                  onBlur={() =>
                    void saveSourcePatch(selectedSource.id, {
                      intervalMinutes: sourceForm.intervalMinutes,
                    })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Limit na běh</span>
                <input
                  value={sourceForm.limitPerRun}
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                  onChange={(e) =>
                    setSourceForm((f) => ({
                      ...f,
                      limitPerRun: Number.parseInt(e.target.value, 10) || 1,
                    }))
                  }
                  onBlur={() =>
                    void saveSourcePatch(selectedSource.id, { limitPerRun: sourceForm.limitPerRun })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">
                  Endpoint / start URL
                  {selectedSource.method === 'scraper' && selectedSource.portal === 'reality_cz' ? (
                    <span className="text-amber-700"> (povinné pro scraper)</span>
                  ) : null}
                </span>
                <input
                  value={sourceForm.endpointUrl}
                  placeholder={
                    selectedSource.method === 'scraper'
                      ? 'https://www.reality.cz/prodej/byty/'
                      : 'Volitelné'
                  }
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                  onChange={(e) =>
                    setSourceForm((f) => ({ ...f, endpointUrl: e.target.value }))
                  }
                  onBlur={(e) =>
                    void saveSourcePatch(selectedSource.id, {
                      endpointUrl: e.target.value.trim() || null,
                    })
                  }
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              SOAP běží přes env (`REALITY_CZ_USERNAME`, `REALITY_CZ_PASSWORD`, `REALITY_CZ_TOTP_SECRET`, `REALITY_CZ_WSDL_URL`).
              Scraper používá uloženou hodnotu z tohoto pole (případně `settingsJson.startUrl` na backendu). Pro výpis nabídek zadejte např.{' '}
              <code className="rounded bg-zinc-100 px-1">https://www.reality.cz/prodej/byty/</code>.
            </p>

            {selectedSource.method === 'scraper' && selectedSource.portal === 'reality_cz' ? (
              <div className="mt-6 border-t border-zinc-200 pt-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-800">Scraper Reality.cz — šetrné stahování</h3>
                <p className="mb-3 text-xs text-zinc-500">
                  Mezi každým HTTP požadavkem je prodleva. Při HTTP 429 se použije exponenciální backoff. Ve výchozím režimu „jen výpis“ se nevolají detailní stránky — nejnižší zátěž pro Reality.cz.
                </p>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-zinc-600">Prodleva mezi požadavky (ms)</span>
                    <input
                      type="number"
                      min={500}
                      max={60000}
                      step={100}
                      value={sourceForm.scraperRequestDelayMs}
                      onChange={(e) =>
                        setSourceForm((f) => ({
                          ...f,
                          scraperRequestDelayMs: Number.parseInt(e.target.value, 10) || 500,
                        }))
                      }
                      onBlur={(e) => {
                        const v = Number.parseInt(e.target.value, 10) || 500;
                        setSourceForm((f) => {
                          const next = { ...f, scraperRequestDelayMs: v };
                          void saveSourcePatch(selectedSource.id, {
                            settingsJson: scraperSettingsPayload(selectedSource, next),
                          });
                          return next;
                        });
                      }}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-zinc-600">Max. pokusů při 429 / chybě</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={sourceForm.scraperMaxRetries}
                      onChange={(e) =>
                        setSourceForm((f) => ({
                          ...f,
                          scraperMaxRetries: Number.parseInt(e.target.value, 10) || 1,
                        }))
                      }
                      onBlur={(e) => {
                        const v = Number.parseInt(e.target.value, 10) || 1;
                        setSourceForm((f) => {
                          const next = { ...f, scraperMaxRetries: v };
                          void saveSourcePatch(selectedSource.id, {
                            settingsJson: scraperSettingsPayload(selectedSource, next),
                          });
                          return next;
                        });
                      }}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-zinc-600">Backoff násobič (429)</span>
                    <input
                      type="number"
                      min={1.25}
                      max={4}
                      step={0.25}
                      value={sourceForm.scraperBackoffMultiplier}
                      onChange={(e) =>
                        setSourceForm((f) => ({
                          ...f,
                          scraperBackoffMultiplier: Number.parseFloat(e.target.value) || 2,
                        }))
                      }
                      onBlur={(e) => {
                        const raw = Number.parseFloat(e.target.value) || 2;
                        const v = Math.min(4, Math.max(1.25, raw));
                        setSourceForm((f) => {
                          const next = { ...f, scraperBackoffMultiplier: v };
                          void saveSourcePatch(selectedSource.id, {
                            settingsJson: scraperSettingsPayload(selectedSource, next),
                          });
                          return next;
                        });
                      }}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-zinc-600">Základní čekání po 429 (ms)</span>
                    <input
                      type="number"
                      min={2000}
                      max={180000}
                      step={1000}
                      value={sourceForm.scraperBaseBackoffMsOn429}
                      onChange={(e) =>
                        setSourceForm((f) => ({
                          ...f,
                          scraperBaseBackoffMsOn429: Number.parseInt(e.target.value, 10) || 2000,
                        }))
                      }
                      onBlur={(e) => {
                        const v = Number.parseInt(e.target.value, 10) || 2000;
                        setSourceForm((f) => {
                          const next = { ...f, scraperBaseBackoffMsOn429: v };
                          void saveSourcePatch(selectedSource.id, {
                            settingsJson: scraperSettingsPayload(selectedSource, next),
                          });
                          return next;
                        });
                      }}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-zinc-600">Max. detailních stránek na běh</span>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={sourceForm.scraperMaxDetailFetchesPerRun}
                      disabled={sourceForm.scraperListOnlyImport}
                      onChange={(e) =>
                        setSourceForm((f) => ({
                          ...f,
                          scraperMaxDetailFetchesPerRun: Number.parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      onBlur={(e) => {
                        const v = Number.parseInt(e.target.value, 10) || 0;
                        setSourceForm((f) => {
                          const next = {
                            ...f,
                            scraperMaxDetailFetchesPerRun: f.scraperListOnlyImport ? 0 : v,
                          };
                          void saveSourcePatch(selectedSource.id, {
                            settingsJson: scraperSettingsPayload(selectedSource, next),
                          });
                          return next;
                        });
                      }}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 disabled:bg-zinc-100"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm md:col-span-2 lg:col-span-1">
                    <input
                      type="checkbox"
                      checked={sourceForm.scraperListOnlyImport}
                      onChange={(e) => {
                        const v = e.target.checked;
                        const next: ImportSourceFormState = {
                          ...sourceForm,
                          scraperListOnlyImport: v,
                          scraperMaxDetailFetchesPerRun: v ? 0 : sourceForm.scraperMaxDetailFetchesPerRun || 10,
                        };
                        setSourceForm(next);
                        void saveSourcePatch(selectedSource.id, {
                          settingsJson: scraperSettingsPayload(selectedSource, next),
                        });
                      }}
                    />
                    <span>Jen výpis (bez HTTP na detail inzerátu)</span>
                  </label>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Nouzové hromadné vypnutí</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <select value={bulkSource} onChange={(e) => setBulkSource(e.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              {SOURCE_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
            <select value={bulkMethod} onChange={(e) => setBulkMethod(e.target.value)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option value="">Všechny metody</option>
              {METHOD_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
            <button type="button" onClick={() => void bulkDisable()} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              Vypnout importované inzeráty
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Import logy</h2>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-zinc-200 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{log.portal}/{log.method}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      log.status === 'ok'
                        ? 'bg-emerald-100 text-emerald-800'
                        : log.status === 'warn'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
                <p className="mt-1 text-zinc-600">
                  New {log.importedNew}, Updated {log.importedUpdated}, Skipped {log.skipped}, Disabled {log.disabled}
                </p>
                {log.message ? <p className="mt-1 text-zinc-700">{log.message}</p> : null}
                <p className="text-zinc-500">{new Date(log.createdAt).toLocaleString('cs-CZ')}</p>
                {log.error ? <p className="mt-1 text-red-700">{log.error}</p> : null}
                {log.payloadJson?.scraper != null && typeof log.payloadJson.scraper === 'object' ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-zinc-600">Technické: scraper (URL, 429, request log)</summary>
                    <pre className="mt-1 max-h-56 overflow-auto rounded border border-zinc-100 bg-zinc-50 p-2 text-[10px] leading-snug text-zinc-800">
                      {JSON.stringify(log.payloadJson.scraper, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))}
            {logs.length === 0 ? <p className="text-sm text-zinc-500">Zatím bez logů.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

