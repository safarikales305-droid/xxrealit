'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminBulkDisableImported,
  nestAdminImportLogs,
  nestAdminImportSources,
  nestAdminRunImportSourceStream,
  nestAdminUpdateImportSource,
  type AdminImportLogRow,
  type AdminImportSourceRow,
} from '@/lib/nest-client';

const BULK_PORTAL_OPTIONS = [
  { value: 'reality_cz', label: 'Reality.cz' },
  { value: 'xml_feed', label: 'XML feed' },
  { value: 'csv_feed', label: 'CSV' },
  { value: 'other', label: 'Jiný portál' },
] as const;

const METHODS_FOR_PORTAL: Record<string, { value: string; label: string }[]> = {
  reality_cz: [
    { value: 'soap', label: 'SOAP' },
    { value: 'scraper', label: 'Scraper' },
  ],
  xml_feed: [{ value: 'xml', label: 'XML' }],
  csv_feed: [{ value: 'csv', label: 'CSV' }],
  other: [{ value: 'other', label: 'Jiné' }],
};
const DEFAULT_REALITY_SCRAPER_START_URL = 'https://www.reality.cz/prodej/byty/?strana=1';

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
  startUrl: string;
  scraperRequestDelayMs: number;
  scraperMaxRetries: number;
  scraperBackoffMultiplier: number;
  scraperBaseBackoffMsOn429: number;
  scraperMaxDetailFetchesPerRun: number;
  scraperListOnlyImport: boolean;
};

function formFromServer(s: AdminImportSourceRow): ImportSourceFormState {
  const sj = (s.settingsJson ?? {}) as Record<string, unknown>;
  const settingsStartUrl = typeof sj.startUrl === 'string' ? sj.startUrl.trim() : '';
  const endpointUrl = s.endpointUrl ?? '';
  const isRealityScraper = s.portal === 'reality_cz' && s.method === 'scraper';
  const resolvedStartUrl = isRealityScraper
    ? settingsStartUrl || endpointUrl || DEFAULT_REALITY_SCRAPER_START_URL
    : '';
  return {
    intervalMinutes: s.intervalMinutes,
    limitPerRun: s.limitPerRun,
    endpointUrl,
    startUrl: resolvedStartUrl,
    scraperRequestDelayMs: readSettingsNumber(sj.scraperRequestDelayMs, 3500),
    scraperMaxRetries: readSettingsNumber(sj.scraperMaxRetries, 6),
    scraperBackoffMultiplier: Math.min(
      4,
      Math.max(1.25, readSettingsFloat(sj.scraperBackoffMultiplier, 2)),
    ),
    scraperBaseBackoffMsOn429: readSettingsNumber(sj.scraperBaseBackoffMsOn429, 12_000),
    scraperMaxDetailFetchesPerRun: readSettingsNumber(sj.scraperMaxDetailFetchesPerRun, 15),
    scraperListOnlyImport:
      typeof sj.scraperListOnlyImport === 'boolean' ? sj.scraperListOnlyImport : false,
  };
}

function isRealityRootUrl(url: string): boolean {
  const t = (url ?? '').trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    const host = u.hostname.toLowerCase();
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    return host.endsWith('reality.cz') && path === '/' && !u.search;
  } catch {
    return /^https?:\/\/(www\.)?reality\.cz\/?$/i.test(t);
  }
}

function isValidRealityListingUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?reality\.cz\/(prodej|pronajem)\//i.test(url.trim());
}

export default function AdminImportsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [sources, setSources] = useState<AdminImportSourceRow[]>([]);
  const [logs, setLogs] = useState<AdminImportLogRow[]>([]);
  const [formsById, setFormsById] = useState<Record<string, ImportSourceFormState>>({});
  const [logFilterSourceId, setLogFilterSourceId] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);
  const [bulkSource, setBulkSource] = useState<string>('reality_cz');
  const [bulkMethod, setBulkMethod] = useState<string>('');
  const [importProgress, setImportProgress] = useState<{
    percent: number;
    message: string;
  } | null>(null);

  const bulkMethodOptions = useMemo(
    () => METHODS_FOR_PORTAL[bulkSource] ?? METHODS_FOR_PORTAL.other,
    [bulkSource],
  );

  useEffect(() => {
    setBulkMethod('');
  }, [bulkSource]);

  useEffect(() => {
    setFormsById((prev) => {
      const next = { ...prev };
      for (const s of sources) {
        const base = formFromServer(s);
        const isRealityScraper = s.portal === 'reality_cz' && s.method === 'scraper';
        next[s.id] = {
          ...base,
          startUrl:
            isRealityScraper && !isValidRealityListingUrl(base.startUrl)
              ? DEFAULT_REALITY_SCRAPER_START_URL
              : base.startUrl,
          endpointUrl:
            isRealityScraper && !isValidRealityListingUrl(base.endpointUrl)
              ? DEFAULT_REALITY_SCRAPER_START_URL
              : base.endpointUrl,
        };
      }
      return next;
    });
  }, [sources]);

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
      startUrl: f.startUrl,
      scraperRequestDelayMs: f.scraperRequestDelayMs,
      scraperMaxRetries: f.scraperMaxRetries,
      scraperBackoffMultiplier: f.scraperBackoffMultiplier,
      scraperBaseBackoffMsOn429: f.scraperBaseBackoffMsOn429,
      scraperMaxDetailFetchesPerRun: f.scraperListOnlyImport ? 0 : f.scraperMaxDetailFetchesPerRun,
      scraperListOnlyImport: f.scraperListOnlyImport,
    };
  }

  function formFor(src: AdminImportSourceRow): ImportSourceFormState {
    return formsById[src.id] ?? formFromServer(src);
  }

  function setFormFor(src: AdminImportSourceRow, partial: Partial<ImportSourceFormState>) {
    setFormsById((prev) => ({
      ...prev,
      [src.id]: { ...(prev[src.id] ?? formFromServer(src)), ...partial },
    }));
  }

  async function refresh(overrideLogSourceId?: string) {
    if (!token) return;
    setError(null);
    const logParam =
      overrideLogSourceId !== undefined
        ? overrideLogSourceId.trim() || undefined
        : logFilterSourceId.trim() || undefined;
    const [s, l] = await Promise.all([
      nestAdminImportSources(token),
      nestAdminImportLogs(token, logParam),
    ]);
    if (!s) {
      setError('Nepodařilo se načíst import sources.');
      return;
    }
    setSources(s);
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
    await refresh();
  }

  async function runSource(sourceId: string) {
    if (!token) return;
    const src = sources.find((s) => s.id === sourceId);
    const isRealityScraper = src?.portal === 'reality_cz' && src?.method === 'scraper';
    const f = src ? formFor(src) : null;
    const startUrlForRun = (f?.startUrl ?? '').trim();
    if (isRealityScraper && !isValidRealityListingUrl(startUrlForRun)) {
      setError(
        'U zdroje „Reality.cz Scraper“ zadejte validní listing URL (např. https://www.reality.cz/prodej/byty/?strana=1). Homepage https://www.reality.cz/ není povolená.',
      );
      setWarnMsg(null);
      setStatusMsg(null);
      return;
    }
    setBusyId(sourceId);
    setImportProgress({ percent: 0, message: 'Spouštím import…' });
    setStatusMsg(null);
    setError(null);
    setWarnMsg(null);
    try {
      const r = await nestAdminRunImportSourceStream(token, sourceId, (ev) => {
        if (ev.type === 'progress') {
          setImportProgress({
            percent: Math.min(100, Math.max(0, Math.round(ev.percent))),
            message: ev.message || '…',
          });
        }
      });
      if (!r.ok) {
        const err = r.error ?? 'Spuštění importu selhalo';
        if (/429|Too Many Requests|blokuje příliš rychlé/i.test(err)) {
          setError(
            'Web Reality.cz blokuje příliš rychlé dotazy (HTTP 429). Zpomalte scraper: zvětšete „Prodleva mezi požadavky (ms)“, případně snižte „Max. detailních stránek na běh“ a případně zapněte „Jen výpis (bez detailů)“.',
          );
        } else {
          setError(err);
        }
        setLogFilterSourceId(sourceId);
        await refresh(sourceId);
        return;
      }
      const n = Number(r.data?.importedNew ?? 0);
      const u = Number(r.data?.importedUpdated ?? 0);
      const d = Number(r.data?.disabled ?? 0);
      const sk = Number(r.data?.skipped ?? 0);
      const warnings = Array.isArray(r.data?.warnings)
        ? r.data.warnings.filter((x): x is string => typeof x === 'string')
        : [];
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
      setLogFilterSourceId(sourceId);
      await refresh(sourceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Neočekávaná chyba při importu.');
      setLogFilterSourceId(sourceId);
      await refresh(sourceId);
    } finally {
      setBusyId(null);
      setImportProgress(null);
    }
  }

  async function bulkDisable() {
    if (!token) return;
    const portalLabel = BULK_PORTAL_OPTIONS.find((x) => x.value === bulkSource)?.label ?? bulkSource;
    const methodLabel = bulkMethod.trim()
      ? (bulkMethodOptions.find((x) => x.value === bulkMethod)?.label ?? bulkMethod)
      : 'všechny metody';
    const confirmText = bulkMethod.trim()
      ? `Vypnout všechny importované inzeráty: ${portalLabel} / ${methodLabel}?`
      : `Vypnout všechny importované inzeráty pro portál ${portalLabel} (všechny metody)?`;
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
    await refresh();
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
            <p className="text-sm text-zinc-600">
              Každý zdroj (SOAP, Scraper, XML, CSV) má vlastní řádek v DB, vlastní nastavení a vlastní logy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold"
            >
              Admin
            </Link>
            <Link
              href="/admin/inzeraty"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold"
            >
              Inzeráty
            </Link>
          </div>
        </header>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
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
          <pre className="whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
            {warnMsg}
          </pre>
        ) : null}

        {importProgress && busyId ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-zinc-600">
              <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">
                {importProgress.message}
              </span>
              <span className="shrink-0 tabular-nums text-zinc-900">{importProgress.percent}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 ease-out"
                style={{ width: `${importProgress.percent}%` }}
              />
            </div>
          </div>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Importní zdroje — přehled</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {sources.map((src) => (
              <article key={src.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-900">{src.name}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {src.portal} / {src.method}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={src.enabled}
                      onChange={(e) => void saveSourcePatch(src.id, { enabled: e.target.checked })}
                      disabled={busyId === src.id}
                    />
                    Enabled
                  </label>
                  <button
                    type="button"
                    onClick={() => void runSource(src.id)}
                    disabled={busyId === src.id}
                    className="rounded-md bg-zinc-900 px-2 py-1 text-white"
                  >
                    Spustit ({src.method})
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {sources.map((src) => {
          const f = formFor(src);
          const isRealitySoap = src.portal === 'reality_cz' && src.method === 'soap';
          const isRealityScraper = src.portal === 'reality_cz' && src.method === 'scraper';
          return (
            <section key={src.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-1 text-base font-semibold">Nastavení: {src.name}</h2>
              <p className="mb-3 text-xs text-zinc-500">
                Zdroj <code className="rounded bg-zinc-100 px-1">{src.id}</code> — {src.portal} /{' '}
                {src.method}. Tlačítko Spustit výše u tohoto řádku volá výhradně tento zdroj.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-zinc-600">Interval (min)</span>
                  <input
                    value={f.intervalMinutes}
                    type="number"
                    min={1}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    onChange={(e) =>
                      setFormFor(src, {
                        intervalMinutes: Number.parseInt(e.target.value, 10) || 1,
                      })
                    }
                    onBlur={() =>
                      void saveSourcePatch(src.id, { intervalMinutes: f.intervalMinutes })
                    }
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-zinc-600">Limit na běh</span>
                  <input
                    value={f.limitPerRun}
                    type="number"
                    min={1}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    onChange={(e) =>
                      setFormFor(src, { limitPerRun: Number.parseInt(e.target.value, 10) || 1 })
                    }
                    onBlur={() => void saveSourcePatch(src.id, { limitPerRun: f.limitPerRun })}
                  />
                </label>
                {!isRealitySoap ? (
                  <label className="text-sm md:col-span-1">
                    <span className="mb-1 block text-xs text-zinc-600">
                      {isRealityScraper ? 'Start URL (scraper)' : 'Endpoint / URL feedu'}
                      {isRealityScraper ? (
                        <span className="text-amber-700"> — povinné</span>
                      ) : null}
                    </span>
                    <input
                      value={isRealityScraper ? f.startUrl : f.endpointUrl}
                      placeholder={
                        isRealityScraper
                          ? 'https://www.reality.cz/prodej/byty/?strana=1'
                          : 'https://…'
                      }
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                      onChange={(e) =>
                        setFormFor(src, isRealityScraper ? { startUrl: e.target.value } : { endpointUrl: e.target.value })
                      }
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (isRealityScraper) {
                          const normalized = raw;
                          if (!isValidRealityListingUrl(normalized)) {
                            setError(
                              'Start URL scraperu musí být ve tvaru https://www.reality.cz/prodej/... nebo https://www.reality.cz/pronajem/...',
                            );
                            setFormFor(src, { startUrl: normalized || DEFAULT_REALITY_SCRAPER_START_URL });
                            return;
                          }
                          setFormFor(src, { startUrl: normalized, endpointUrl: normalized });
                          void saveSourcePatch(src.id, {
                            endpointUrl: normalized,
                            settingsJson: scraperSettingsPayload(src, {
                              ...f,
                              startUrl: normalized,
                              endpointUrl: normalized,
                            }),
                          });
                          return;
                        }
                        setFormFor(src, { endpointUrl: raw });
                        void saveSourcePatch(src.id, { endpointUrl: raw || null });
                      }}
                    />
                  </label>
                ) : (
                  <div className="text-sm text-zinc-600 md:col-span-1">
                    <span className="mb-1 block text-xs font-medium text-zinc-700">SOAP endpoint</span>
                    <p className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs leading-relaxed">
                      SOAP <strong>nepoužívá</strong> start URL z administrace. Konfigurace je v proměnných prostředí:{' '}
                      <code className="text-[11px]">REALITY_CZ_USERNAME</code>,{' '}
                      <code className="text-[11px]">REALITY_CZ_PASSWORD</code>,{' '}
                      <code className="text-[11px]">REALITY_CZ_TOTP_SECRET</code>,{' '}
                      <code className="text-[11px]">REALITY_CZ_WSDL_URL</code>.
                    </p>
                  </div>
                )}
              </div>

              {isRealitySoap ? (
                <p className="mt-3 text-xs text-zinc-500">
                  Chyba „SOAP není nakonfigurovaný“ se týká <strong>pouze</strong> tohoto zdroje po kliknutí na Spustit u
                  Reality.cz SOAP. Pro scraper použijte sekci <strong>Reality.cz Scraper</strong> níže.
                </p>
              ) : null}

              {isRealityScraper ? (
                <>
                  <p className="mt-3 text-xs text-zinc-500">
                    Scraper bere start URL výhradně z pole <strong>Start URL</strong> výše (případně z{' '}
                    <code className="rounded bg-zinc-100 px-1">settingsJson.startUrl</code> na backendu, pokud ho
                    doplníte ručně v DB). Nesdílí konfiguraci s SOAP.
                  </p>
                  <div className="mt-6 border-t border-zinc-200 pt-4">
                    <h3 className="mb-2 text-sm font-semibold text-zinc-800">
                      Scraper Reality.cz — šetrné stahování
                    </h3>
                    <p className="mb-3 text-xs text-zinc-500">
                      Mezi každým HTTP požadavkem je prodleva. Při HTTP 429 se použije exponenciální backoff. Ve výchozím
                      režimu „jen výpis“ se nevolají detailní stránky.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      <label className="text-sm">
                        <span className="mb-1 block text-xs text-zinc-600">Prodleva mezi požadavky (ms)</span>
                        <input
                          type="number"
                          min={500}
                          max={60000}
                          step={100}
                          value={f.scraperRequestDelayMs}
                          onChange={(e) =>
                            setFormFor(src, {
                              scraperRequestDelayMs: Number.parseInt(e.target.value, 10) || 500,
                            })
                          }
                          onBlur={(e) => {
                            const v = Number.parseInt(e.target.value, 10) || 500;
                            const next = { ...f, scraperRequestDelayMs: v };
                            setFormFor(src, next);
                            void saveSourcePatch(src.id, {
                              settingsJson: scraperSettingsPayload(src, next),
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
                          value={f.scraperMaxRetries}
                          onChange={(e) =>
                            setFormFor(src, {
                              scraperMaxRetries: Number.parseInt(e.target.value, 10) || 1,
                            })
                          }
                          onBlur={(e) => {
                            const v = Number.parseInt(e.target.value, 10) || 1;
                            const next = { ...f, scraperMaxRetries: v };
                            setFormFor(src, next);
                            void saveSourcePatch(src.id, {
                              settingsJson: scraperSettingsPayload(src, next),
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
                          value={f.scraperBackoffMultiplier}
                          onChange={(e) =>
                            setFormFor(src, {
                              scraperBackoffMultiplier: Number.parseFloat(e.target.value) || 2,
                            })
                          }
                          onBlur={(e) => {
                            const raw = Number.parseFloat(e.target.value) || 2;
                            const v = Math.min(4, Math.max(1.25, raw));
                            const next = { ...f, scraperBackoffMultiplier: v };
                            setFormFor(src, next);
                            void saveSourcePatch(src.id, {
                              settingsJson: scraperSettingsPayload(src, next),
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
                          value={f.scraperBaseBackoffMsOn429}
                          onChange={(e) =>
                            setFormFor(src, {
                              scraperBaseBackoffMsOn429: Number.parseInt(e.target.value, 10) || 2000,
                            })
                          }
                          onBlur={(e) => {
                            const v = Number.parseInt(e.target.value, 10) || 2000;
                            const next = { ...f, scraperBaseBackoffMsOn429: v };
                            setFormFor(src, next);
                            void saveSourcePatch(src.id, {
                              settingsJson: scraperSettingsPayload(src, next),
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
                          value={f.scraperMaxDetailFetchesPerRun}
                          disabled={f.scraperListOnlyImport}
                          onChange={(e) =>
                            setFormFor(src, {
                              scraperMaxDetailFetchesPerRun: Number.parseInt(e.target.value, 10) || 0,
                            })
                          }
                          onBlur={(e) => {
                            const v = Number.parseInt(e.target.value, 10) || 0;
                            const next = {
                              ...f,
                              scraperMaxDetailFetchesPerRun: f.scraperListOnlyImport ? 0 : v,
                            };
                            setFormFor(src, next);
                            void saveSourcePatch(src.id, {
                              settingsJson: scraperSettingsPayload(src, next),
                            });
                          }}
                          className="w-full rounded-lg border border-zinc-200 px-3 py-2 disabled:bg-zinc-100"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm md:col-span-2 lg:col-span-1">
                        <input
                          type="checkbox"
                          checked={f.scraperListOnlyImport}
                          onChange={(e) => {
                            const v = e.target.checked;
                            const next: ImportSourceFormState = {
                              ...f,
                              scraperListOnlyImport: v,
                              scraperMaxDetailFetchesPerRun: v ? 0 : f.scraperMaxDetailFetchesPerRun || 10,
                            };
                            setFormFor(src, next);
                            void saveSourcePatch(src.id, {
                              settingsJson: scraperSettingsPayload(src, next),
                            });
                          }}
                        />
                        <span>Jen výpis (bez HTTP na detail inzerátu)</span>
                      </label>
                    </div>
                  </div>
                </>
              ) : null}
            </section>
          );
        })}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Nouzové hromadné vypnutí importovaných inzerátů</h2>
          <p className="mb-3 text-xs text-zinc-600">
            Nejprve zvolte portál, pak přesnou metodu importu (např. Reality.cz / Scraper). Prázdná metoda = všechny
            metody daného portálu.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-zinc-600">Portál</span>
              <select
                value={bulkSource}
                onChange={(e) => setBulkSource(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2"
              >
                {BULK_PORTAL_OPTIONS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-zinc-600">Metoda importu</span>
              <select
                value={bulkMethod}
                onChange={(e) => setBulkMethod(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2"
              >
                <option value="">Všechny metody tohoto portálu</option>
                {bulkMethodOptions.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void bulkDisable()}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
            >
              Vypnout importované inzeráty
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold">Import logy</h2>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-zinc-600">Filtrovat podle zdroje</span>
              <select
                value={logFilterSourceId}
                onChange={(e) => {
                  const v = e.target.value;
                  setLogFilterSourceId(v);
                  void refresh(v);
                }}
                className="min-w-[220px] rounded-lg border border-zinc-200 px-3 py-2"
              >
                <option value="">Všechny zdroje</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.portal}/{s.method})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-zinc-200 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {log.portal}/{log.method}
                    {log.source?.name ? ` — ${log.source.name}` : ''}
                  </span>
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
                  New {log.importedNew}, Updated {log.importedUpdated}, Skipped {log.skipped}, Disabled{' '}
                  {log.disabled}
                </p>
                {log.message ? <p className="mt-1 text-zinc-700">{log.message}</p> : null}
                <p className="text-zinc-500">{new Date(log.createdAt).toLocaleString('cs-CZ')}</p>
                {log.error ? <p className="mt-1 text-red-700">{log.error}</p> : null}
                {log.payloadJson &&
                typeof log.payloadJson === 'object' &&
                log.payloadJson !== null &&
                'run' in log.payloadJson &&
                log.payloadJson.run != null ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-zinc-600">Kontext běhu (zdroj, metoda, URL)</summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded border border-zinc-100 bg-zinc-50 p-2 text-[10px] leading-snug text-zinc-800">
                      {JSON.stringify(
                        (log.payloadJson as Record<string, unknown>).run,
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                ) : null}
                {log.payloadJson?.scraper != null && typeof log.payloadJson.scraper === 'object' ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-zinc-600">
                      Technické: scraper (URL, 429, request log)
                    </summary>
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
