'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  nestAdminCsuDataStatStatus,
  nestAdminCsuDataStatSync,
  nestAdminRuianVfrDailyDownload,
  nestAdminRuianVfrDiscover,
  nestAdminRuianVfrFullImport,
  nestAdminRuianVfrStatus,
  nestAdminRuianVfrSyncDelta,
  nestAdminRuianVfrUpload,
  nestAdminSeoLocationDiagnosticsRun,
  nestAdminSeoLocationImports,
  nestAdminSeoLocationSourceUpdate,
  nestAdminSeoLocationSources,
  type CsuDataStatStatus,
  type RuianVfrStatus,
  type SeoLocationSourceCard,
} from '@/lib/nest-client';

const STATUS_COLORS: Record<string, string> = {
  ok: 'bg-green-100 text-green-800 border-green-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  syncing: 'bg-blue-100 text-blue-800 border-blue-200',
  idle: 'bg-amber-100 text-amber-800 border-amber-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
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
  const [logSourceId, setLogSourceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const vfrFileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [srcRes, ruianRes, csuRes] = await Promise.all([
      nestAdminSeoLocationSources(token),
      nestAdminRuianVfrStatus(token),
      nestAdminCsuDataStatStatus(token),
    ]);
    if (srcRes) setSources(srcRes);
    if (ruianRes) setRuianStatus(ruianRes);
    if (csuRes) setCsuStatus(csuRes);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ruian = sources.find((s) => s.type === 'RUIAN');
  const csu = sources.find((s) => s.type === 'CSU');

  async function runAction(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      const r = res as Record<string, unknown> | null;
      if (r?.inserted !== undefined || r?.updated !== undefined) {
        setMsg(
          `${label}: +${String(r.inserted ?? 0)} nových, ${String(r.updated ?? 0)} aktualizovaných, ${String(r.errorCount ?? 0)} chyb`,
        );
      } else if (r?.downloaded) {
        setMsg(`${label}: staženo ${String(r.downloaded)}`);
      } else if (r?.filename) {
        setMsg(`${label}: nalezen ${String(r.filename)} (${String(r.version ?? '')})`);
      } else if (r?.updated !== undefined && r?.parsed !== undefined) {
        setMsg(`${label}: ${String(r.updated)} obcí aktualizováno z ${String(r.parsed)} řádků`);
      } else {
        setMsg(`${label} dokončeno.`);
      }
      void refresh();
      onImported?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : `${label} selhalo`);
    } finally {
      setBusy(false);
    }
  }

  async function openLogs(sourceId: string) {
    setLogSourceId(sourceId);
    const res = await nestAdminSeoLocationImports(token, sourceId);
    setLogs(res ?? []);
  }

  async function toggleAutoSync(source: SeoLocationSourceCard, enabled: boolean) {
    await nestAdminSeoLocationSourceUpdate(token, source.id, { autoSync: enabled });
    void refresh();
  }

  const ruianStats = ruianStatus?.stats ?? {};
  const ruianStatusClass = STATUS_COLORS[ruianStatus?.lastStatus ?? 'idle'] ?? STATUS_COLORS.idle;
  const csuStatusClass = STATUS_COLORS[csuStatus?.lastStatus ?? 'idle'] ?? STATUS_COLORS.idle;

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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`rounded-2xl border p-5 ${ruianStatusClass}`}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">RÚIAN</p>
              <h3 className="text-lg font-bold">Oficiální registr lokalit</h3>
              <p className="mt-1 text-xs opacity-80">API klíč není vyžadován</p>
            </div>
            <span className="rounded-full px-2 py-0.5 text-xs font-medium capitalize">
              {ruianStatus?.lastStatus ?? 'idle'}
            </span>
          </div>

          <p className="mb-3 text-sm">
            Poskytuje: kraje, okresy, ORP, obce, části obcí, katastry, ulice, adresní místa, hierarchii a souřadnice.
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
            <dd className="truncate font-mono">{ruianStatus?.lastAvailableFile ?? '—'}</dd>
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
            <dt>Průběh</dt>
            <dd>{ruianStatus?.progressPct ?? 0} %</dd>
          </dl>

          {ruianStatus?.lastError ? (
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
              onClick={() => void runAction('Plný import', () => nestAdminRuianVfrFullImport(token))}
            />
            <ActionBtn
              disabled={busy}
              label="Stáhnout denní změny"
              onClick={() => void runAction('Stažení delty', () => nestAdminRuianVfrDailyDownload(token))}
            />
            <ActionBtn
              disabled={busy}
              label="Synchronizovat změny"
              onClick={() => void runAction('Sync delty', () => nestAdminRuianVfrSyncDelta(token))}
            />
            <ActionBtn disabled={busy} label="Nahrát VFR ručně" onClick={() => vfrFileRef.current?.click()} />
            {ruian ? (
              <ActionBtn disabled={busy} label="Zobrazit log" onClick={() => void openLogs(ruian.id)} />
            ) : null}
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

          <input
            ref={vfrFileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void runAction('Ruční VFR', () => nestAdminRuianVfrUpload(token, file));
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
            {csu ? (
              <ActionBtn disabled={busy} label="Zobrazit log" onClick={() => void openLogs(csu.id)} />
            ) : null}
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

      {msg ? <p className="rounded-lg border bg-white px-3 py-2 text-sm">{msg}</p> : null}

      {logSourceId ? (
        <div className="rounded-2xl border bg-white p-4">
          <div className="mb-2 flex justify-between">
            <h3 className="font-semibold">Log importů</h3>
            <button type="button" onClick={() => setLogSourceId(null)} className="text-sm text-zinc-500">
              Zavřít
            </button>
          </div>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {logs.map((l) => (
              <li key={String(l.id)} className="flex justify-between border-b py-1">
                <span>
                  {String(l.status)} · {String(l.filename ?? l.sourceLabel ?? '')}
                </span>
                <span>
                  +{String(l.inserted)} / ~{String(l.updated)} · {String(l.errorCount)} chyb
                </span>
              </li>
            ))}
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
