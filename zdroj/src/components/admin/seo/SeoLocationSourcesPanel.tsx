'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  nestAdminCsuDataStatStatus,
  nestAdminCsuDataStatSync,
  nestAdminRuianVfrDailyDownload,
  nestAdminRuianVfrDiscover,
  nestAdminRuianVfrFullImport,
  nestAdminRuianVfrLiveStatus,
  nestAdminRuianVfrLogs,
  nestAdminRuianVfrStatus,
  nestAdminRuianVfrSyncDelta,
  nestAdminRuianVfrTestImport,
  nestAdminRuianVfrUpload,
  nestAdminSeoLocationDiagnosticsRun,
  nestAdminSeoLocationSourceUpdate,
  nestAdminSeoLocationSources,
  type CsuDataStatStatus,
  type RuianVfrLogsResponse,
  type RuianVfrStatus,
  type SeoLocationSourceCard,
} from '@/lib/nest-client';

const STATUS_COLORS: Record<string, string> = {
  ok: 'bg-green-100 text-green-800 border-green-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  syncing: 'bg-blue-100 text-blue-800 border-blue-200',
  idle: 'bg-amber-100 text-amber-800 border-amber-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  empty_import: 'bg-orange-100 text-orange-900 border-orange-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

type Props = {
  token: string;
  onImported?: () => void;
};

export function SeoLocationSourcesPanel({ token, onImported }: Props) {
  const [sources, setSources] = useState<SeoLocationSourceCard[]>([]);
  const [ruianStatus, setRuianStatus] = useState<RuianVfrStatus | null>(null);
  const [csuStatus, setCsuStatus] = useState<CsuDataStatStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [importLogs, setImportLogs] = useState<RuianVfrLogsResponse | null>(null);
  const [testPreview, setTestPreview] = useState<Array<{ officialCode: string; name: string }>>([]);
  const vfrFileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const [srcRes, ruianRes, csuRes] = await Promise.all([
      nestAdminSeoLocationSources(token),
      nestAdminRuianVfrStatus(token),
      nestAdminCsuDataStatStatus(token),
    ]);
    if (srcRes) setSources(srcRes);
    if (ruianRes) {
      setRuianStatus(ruianRes);
      if (!busy && ruianRes.progressPct) setProgressPct(ruianRes.progressPct);
      if (!busy && ruianRes.currentStep) setCurrentStep(ruianRes.currentStep);
    }
    if (csuRes) setCsuStatus(csuRes);
  }, [token, busy]);

  const refreshLogs = useCallback(async () => {
    try {
      const logs = await nestAdminRuianVfrLogs(token);
      setImportLogs(logs);
      if (logs.running || busy) {
        setProgressPct(logs.progressPct);
        setCurrentStep(logs.currentStep);
      }
    } catch {
      /* ignore poll errors */
    }
  }, [token, busy]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(onComplete?: () => void) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const live = await nestAdminRuianVfrLiveStatus(token);
          setProgressPct(live.progressPct);
          setCurrentStep(live.currentStep);
          if (!live.running && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setBusy(false);
            const logs = await nestAdminRuianVfrLogs(token);
            setImportLogs(logs);
            const last = logs.lastJobResult;
            if (last?.success === false) {
              const step = last.step ? `[${String(last.step)}] ` : '';
              setErrorMsg(`${step}${String(last.error ?? 'Import selhal.')}`);
            } else if (Array.isArray(last?.preview)) {
              const preview = last.preview as Array<{ officialCode?: string; name?: string }>;
              setTestPreview(
                preview.map((p) => ({ officialCode: p.officialCode ?? '', name: p.name ?? '' })),
              );
              setMsg(
                `Test importu: ${preview.length} obcí, XML souborů: ${String(last?.xmlFiles ?? '?')}, parsováno: ${String(last?.parsedMunicipalities ?? '?')}`,
              );
            } else if (last?.inserted !== undefined || last?.updated !== undefined) {
              setMsg(
                `Import: +${String(last.inserted ?? 0)} nových, ${String(last.updated ?? 0)} aktualizovaných, ${String(last.errorCount ?? 0)} chyb`,
              );
              setProgressPct(100);
              setCurrentStep('Hotovo');
            } else if (live.lastJobError) {
              setErrorMsg(String(live.lastJobError));
            }
            void refresh();
            void refreshLogs();
            onImported?.();
            onComplete?.();
          }
        } catch {
          /* keep polling */
        }
        void refreshLogs();
      })();
    }, 2000);
  }

  const ruian = sources.find((s) => s.type === 'RUIAN');
  const csu = sources.find((s) => s.type === 'CSU');

  async function runAction(label: string, fn: () => Promise<unknown>, poll = false) {
    setBusy(true);
    setMsg(null);
    setErrorMsg(null);
    setProgressPct(0);
    setCurrentStep('START IMPORT');
    if (poll) startPolling();
    try {
      const res = await fn();
      const r = res as Record<string, unknown>;
      if (r.success === false) {
        const status = String(r.status ?? '');
        const step = r.step ? `[${String(r.step)}] ` : '';
        if (status === 'EMPTY_IMPORT') {
          setErrorMsg('Import doběhl, ale nebyly nalezeny žádné záznamy.');
        } else {
          setErrorMsg(`${step}${String(r.error ?? 'Import selhal.')}`);
        }
        setBusy(false);
        if (pollRef.current) clearInterval(pollRef.current);
        void refreshLogs();
        void refresh();
        return;
      }
      if (r.started === true || r.running === true) {
        setMsg(String(r.message ?? `${label} běží na pozadí — sledujte log.`));
        if (!poll) {
          setBusy(false);
        }
        return;
      }
      if (r.inserted !== undefined || r.updated !== undefined) {
        setMsg(
          `${label}: +${String(r.inserted ?? 0)} nových, ${String(r.updated ?? 0)} aktualizovaných, ${String(r.errorCount ?? 0)} chyb`,
        );
        setProgressPct(100);
        setCurrentStep('Hotovo.');
      } else if (r.downloaded) {
        setMsg(`${label}: staženo ${String(r.downloaded)}`);
        setProgressPct(100);
      } else if (r.file && typeof r.file === 'object') {
        const f = r.file as { filename?: string; version?: string; url?: string };
        setMsg(`${label}: nalezen ${f.filename ?? ''} (${f.version ?? ''})`);
      } else if (Array.isArray(r.preview)) {
        const preview = r.preview as Array<{ officialCode?: string; name?: string }>;
        setTestPreview(
          preview.map((p) => ({ officialCode: p.officialCode ?? '', name: p.name ?? '' })),
        );
        setMsg(`${label}: náhled ${preview.length} obcí (bez zápisu do DB)`);
      } else if (r.updated !== undefined && r.parsed !== undefined) {
        setMsg(`${label}: ${String(r.updated)} obcí aktualizováno z ${String(r.parsed)} řádků`);
      } else {
        setMsg(`${label} dokončeno.`);
      }
      if (!poll) {
        setBusy(false);
        void refresh();
        onImported?.();
      }
    } catch (e) {
      const errText = e instanceof Error ? e.message : `${label} selhalo`;
      if (poll && /síťová chyba|failed to fetch|network/i.test(errText)) {
        setErrorMsg(
          `${errText} Import může pokračovat na pozadí — otevřete log pro aktuální stav.`,
        );
        void refreshLogs();
      } else {
        setErrorMsg(errText);
        setBusy(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } finally {
      void refreshLogs();
    }
  }

  async function openLogs() {
    setShowLogs(true);
    await refreshLogs();
  }

  async function toggleAutoSync(source: SeoLocationSourceCard, enabled: boolean) {
    await nestAdminSeoLocationSourceUpdate(token, source.id, { autoSync: enabled });
    void refresh();
  }

  const ruianStats = ruianStatus?.stats ?? {};
  const ruianObce = ruianStats.obce ?? 0;
  const ruianLastStatus = busy ? 'syncing' : (ruianStatus?.lastStatus ?? 'idle');
  const ruianStatusKey =
    ruianLastStatus === 'empty_import' || (ruianLastStatus === 'ok' && ruianObce === 0)
      ? 'empty_import'
      : ruianLastStatus === 'ok' && ruianObce > 0
        ? 'ok'
        : ruianLastStatus === 'error'
          ? 'error'
          : ruianLastStatus;
  const ruianStatusClass = STATUS_COLORS[ruianStatusKey] ?? STATUS_COLORS.idle;
  const csuStatusClass = STATUS_COLORS[csuStatus?.lastStatus ?? 'idle'] ?? STATUS_COLORS.idle;
  const logEntries = importLogs?.entries ?? [];

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">Oficiální datové zdroje lokalit</h2>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium"
          onClick={() => void runAction('Diagnostika', () => nestAdminSeoLocationDiagnosticsRun(token))}
        >
          Spustit diagnostiku
        </button>
      </div>

      {(busy || progressPct > 0) && (
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">{currentStep ?? 'Import probíhá…'}</span>
            <span className="tabular-nums">{Math.round(progressPct)} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full bg-orange-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-zinc-500">
            <span>0 %</span>
            <span>25 %</span>
            <span>50 %</span>
            <span>75 %</span>
            <span>100 %</span>
          </div>
        </div>
      )}

      {errorMsg ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMsg}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`rounded-2xl border p-5 ${ruianStatusClass}`}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">RÚIAN</p>
              <h3 className="text-lg font-bold">Oficiální registr lokalit</h3>
              <p className="mt-1 text-xs opacity-80">API klíč není vyžadován</p>
            </div>
            <span className="rounded-full px-2 py-0.5 text-xs font-medium capitalize">
              {ruianStatusKey}
            </span>
          </div>

          <p className="mb-3 text-sm">
            Poskytuje: kraje, okresy, ORP, POÚ, obce, části obcí, katastry, ulice, adresní místa, hierarchii a
            souřadnice.
          </p>
          <p className="mb-3 text-xs">
            Poslední synchronizace:{' '}
            {ruianStatus?.lastSyncAt
              ? new Date(ruianStatus.lastSyncAt).toLocaleString('cs-CZ')
              : 'zatím neproběhla'}
          </p>

          <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt>Režim</dt>
            <dd>{ruianStatus?.mode === 'delta' ? 'denní změny' : 'plný import'}</dd>
            <dt>Poslední dostupný soubor</dt>
            <dd className="truncate font-mono" title={ruianStatus?.lastAvailableUrl ?? undefined}>
              {ruianStatus?.lastAvailableFile ?? '—'}
            </dd>
            {ruianStatus?.lastAvailableUrl ? (
              <>
                <dt>URL zdroje</dt>
                <dd className="col-span-1 truncate font-mono text-[10px]" title={ruianStatus.lastAvailableUrl}>
                  {ruianStatus.lastAvailableUrl}
                </dd>
              </>
            ) : null}
            <dt>Poslední importovaný</dt>
            <dd className="truncate font-mono">{ruianStatus?.lastImportedFile ?? '—'}</dd>
            <dt>Obce</dt>
            <dd>{(ruianStats.obce ?? 0).toLocaleString('cs-CZ')}</dd>
            <dt>Části obcí</dt>
            <dd>{(ruianStats.castiObci ?? 0).toLocaleString('cs-CZ')}</dd>
            <dt>Katastry</dt>
            <dd>{(ruianStats.katastry ?? 0).toLocaleString('cs-CZ')}</dd>
            <dt>Adresní místa</dt>
            <dd>{(ruianStats.adresniMista ?? 0).toLocaleString('cs-CZ')}</dd>
            <dt>Chyby</dt>
            <dd>{ruian?.errorCount ?? 0}</dd>
          </dl>

          {ruianStatusKey === 'empty_import' && !errorMsg ? (
            <p className="mb-3 text-xs text-orange-800">
              Import doběhl, ale nebyly nalezeny žádné záznamy.
            </p>
          ) : null}

          {ruianStatus?.lastError && !errorMsg ? (
            <p className="mb-3 text-xs text-red-700">{ruianStatus.lastError}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <ActionBtn
              disabled={busy}
              label="Najít nejnovější stavový soubor"
              onClick={() => void runAction('Discovery', () => nestAdminRuianVfrDiscover(token, 'full'))}
            />
            <ActionBtn
              disabled={busy}
              primary
              label="Spustit plný import"
              onClick={() => void runAction('Plný import', () => nestAdminRuianVfrFullImport(token), true)}
            />
            <ActionBtn
              disabled={busy}
              label="Test importu 100 záznamů"
              onClick={() =>
                void runAction('Test importu', () => nestAdminRuianVfrTestImport(token, 100), true)
              }
            />
            <ActionBtn
              disabled={busy}
              label="Stáhnout denní změny"
              onClick={() => void runAction('Stažení delty', () => nestAdminRuianVfrDailyDownload(token))}
            />
            <ActionBtn
              disabled={busy}
              label="Synchronizovat změny"
              onClick={() => void runAction('Sync delty', () => nestAdminRuianVfrSyncDelta(token), true)}
            />
            <ActionBtn disabled={busy} label="Nahrát VFR ručně" onClick={() => vfrFileRef.current?.click()} />
            <ActionBtn disabled={busy} label="Zobrazit log" onClick={() => void openLogs()} />
          </div>

          {ruian ? (
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={ruian.autoSync}
                onChange={(e) => void toggleAutoSync(ruian, e.target.checked)}
              />
              Automatická synchronizace (denní delta, měsíční plný import)
            </label>
          ) : null}

          {testPreview.length > 0 ? (
            <div className="mt-3 rounded-lg border bg-white/60 p-2 text-xs">
              <p className="mb-1 font-semibold">Náhled obcí (test)</p>
              <ul className="max-h-24 overflow-y-auto font-mono">
                {testPreview.slice(0, 10).map((row) => (
                  <li key={row.officialCode}>
                    {row.officialCode} — {row.name}
                  </li>
                ))}
                {testPreview.length > 10 ? (
                  <li className="text-zinc-500">… a dalších {testPreview.length - 10}</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <input
            ref={vfrFileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void runAction('Ruční VFR', () => nestAdminRuianVfrUpload(token, file), true);
            }}
          />
        </div>

        <div className={`rounded-2xl border p-5 ${csuStatusClass}`}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">ČSÚ</p>
              <h3 className="text-lg font-bold">Statistiky lokalit</h3>
              <p className="mt-1 text-xs opacity-80">API klíč není vyžadován</p>
            </div>
            <span className="rounded-full px-2 py-0.5 text-xs font-medium capitalize">
              {csuStatus?.lastStatus ?? 'idle'}
            </span>
          </div>

          <p className="mb-3 text-sm">
            Poskytuje: počet obyvatel, statistické kódy obcí a demografická metadata. Nepřepisuje územní strukturu z
            RÚIAN.
          </p>
          <p className="mb-3 text-xs">
            Poslední synchronizace:{' '}
            {csuStatus?.lastSyncAt ? new Date(csuStatus.lastSyncAt).toLocaleString('cs-CZ') : 'zatím neproběhla'}
          </p>

          <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt>DataStat API</dt>
            <dd className="truncate font-mono">{csuStatus?.baseUrl ?? '—'}</dd>
            <dt>Datová sada</dt>
            <dd>
              {csuStatus?.datasetCode ?? '—'} / {csuStatus?.predefinedVyberCode ?? '—'}
            </dd>
            <dt>Aktualizované obce</dt>
            <dd>{(csuStatus?.updatedMunicipalities ?? 0).toLocaleString('cs-CZ')}</dd>
            <dt>Chyby</dt>
            <dd>{csu?.errorCount ?? 0}</dd>
          </dl>

          {csuStatus?.lastError ? <p className="mb-3 text-xs text-red-700">{csuStatus.lastError}</p> : null}

          <div className="flex flex-wrap gap-2">
            <ActionBtn
              disabled={busy}
              primary
              label="Synchronizovat obyvatelstvo"
              onClick={() => void runAction('ČSÚ sync', () => nestAdminCsuDataStatSync(token))}
            />
            <ActionBtn
              disabled={busy}
              label="Testovací sync"
              onClick={() => void runAction('ČSÚ dry-run', () => nestAdminCsuDataStatSync(token, true))}
            />
          </div>

          {csu ? (
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={csu.autoSync}
                onChange={(e) => void toggleAutoSync(csu, e.target.checked)}
              />
              Automatická měsíční synchronizace
            </label>
          ) : null}
        </div>
      </div>

      {msg && !errorMsg ? <p className="rounded-lg border bg-white px-3 py-2 text-sm">{msg}</p> : null}

      {showLogs ? (
        <div className="rounded-2xl border bg-white p-4">
          <div className="mb-2 flex justify-between gap-2">
            <h3 className="font-semibold">Log importu RÚIAN</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-sm text-zinc-600"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(importLogs, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `ruian-vfr-log-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Stáhnout JSON
              </button>
              <button type="button" onClick={() => setShowLogs(false)} className="text-sm text-zinc-500">
                Zavřít
              </button>
            </div>
          </div>
          <p className="mb-2 text-xs text-zinc-500">
            {importLogs?.running ? 'Import probíhá…' : 'Poslední běh'}
            {importLogs?.latestRunId ? ` · run ${importLogs.latestRunId}` : ''}
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
            {logEntries.length === 0 ? (
              <li className="text-zinc-500">Zatím žádné záznamy.</li>
            ) : (
              logEntries.map((entry, i) => (
                <li
                  key={`${entry.at}-${i}`}
                  className={`border-b py-1 ${entry.level === 'error' ? 'text-red-700' : entry.level === 'warn' ? 'text-amber-700' : 'text-zinc-800'}`}
                >
                  <span className="text-zinc-400">{new Date(entry.at).toLocaleTimeString('cs-CZ')}</span>{' '}
                  <span className="text-zinc-500">[{entry.progressPct}%]</span> {entry.message}
                  {entry.meta ? (
                    <span className="block text-zinc-500">
                      {JSON.stringify(entry.meta).slice(0, 200)}
                      {JSON.stringify(entry.meta).length > 200 ? '…' : ''}
                    </span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
        primary ? 'bg-zinc-900 text-white' : 'border bg-white'
      }`}
    >
      {label}
    </button>
  );
}
