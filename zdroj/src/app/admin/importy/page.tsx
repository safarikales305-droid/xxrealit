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
  const [sourceForm, setSourceForm] = useState<{
    intervalMinutes: number;
    limitPerRun: number;
    endpointUrl: string;
  }>({ intervalMinutes: 60, limitPerRun: 100, endpointUrl: '' });
  const [bulkSource, setBulkSource] = useState<string>('reality_cz');
  const [bulkMethod, setBulkMethod] = useState<string>('');

  const selectedSource = useMemo(
    () => sources.find((x) => x.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  useEffect(() => {
    if (!selectedSource) return;
    setSourceForm({
      intervalMinutes: selectedSource.intervalMinutes,
      limitPerRun: selectedSource.limitPerRun,
      endpointUrl: selectedSource.endpointUrl ?? '',
    });
  }, [
    selectedSource?.id,
    selectedSource?.updatedAt,
    selectedSource?.intervalMinutes,
    selectedSource?.limitPerRun,
    selectedSource?.endpointUrl,
  ]);

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
      setError(r.error ?? 'Spuštění importu selhalo');
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
              </div>
            ))}
            {logs.length === 0 ? <p className="text-sm text-zinc-500">Zatím bez logů.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

