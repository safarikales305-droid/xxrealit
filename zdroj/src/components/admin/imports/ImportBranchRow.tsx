'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { AdminImportSourceRow, NestAdminImportRunResult } from '@/lib/nest-client';
import { ImportProgressBar } from './ImportProgressBar';

type Props = {
  branch: AdminImportSourceRow;
  /** Poslední výsledek streamu po dokončení běhu (log chyb). */
  lastImportDebug?: NestAdminImportRunResult;
  busy: boolean;
  onRun: (id: string) => void;
  onEdit: (branch: AdminImportSourceRow) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
};

function phaseLabelCs(phase?: string): string {
  switch (phase) {
    case 'listing':
      return 'Načítání výpisu';
    case 'details':
      return 'Doplňování detailů';
    case 'done':
      return 'Hotovo';
    case 'error':
      return 'Chyba';
    default:
      return 'Běží';
  }
}

export function ImportBranchRow({
  branch,
  lastImportDebug,
  busy,
  onRun,
  onEdit,
  onToggle,
  onDelete,
}: Props) {
  const [logOpen, setLogOpen] = useState(false);
  const liveLog = branch.running?.itemErrorLog;
  const doneLog = lastImportDebug?.itemErrors;
  const logPayload = (liveLog?.length ? liveLog : doneLog) ?? [];
  const lastErr = branch.running?.lastItemErrorMessage ?? null;
  const lastCat = branch.running?.lastItemErrorCategory ?? null;
  const lastUrl = branch.running?.lastProcessedSourceUrl ?? null;
  const lastExt = branch.running?.lastItemErrorExternalId ?? null;
  const stats =
    lastImportDebug?.stats && typeof lastImportDebug.stats === 'object'
      ? (lastImportDebug.stats as Record<string, unknown>)
      : null;
  const detailReqLog = Array.isArray(stats?.['requestLog'])
    ? (stats?.['requestLog'] as Array<Record<string, unknown>>)
    : [];
  const lastDetailUrl =
    [...detailReqLog]
      .reverse()
      .find((x) => x?.['phase'] === 'detail_page' && typeof x?.['url'] === 'string')?.['url'] ??
    null;

  return (
    <>
    <tr className="border-t border-zinc-100 align-top">
      <td className="px-3 py-2">
        <div className="font-medium text-zinc-900">{branch.categoryLabel ?? 'Obecné'}</div>
        <div className="text-[11px] text-zinc-500">{branch.method}</div>
      </td>
      <td className="px-3 py-2 text-xs text-zinc-700">
        <div className="max-w-[340px] truncate">{branch.endpointUrl || '—'}</div>
      </td>
      <td className="px-3 py-2 text-xs">{branch.intervalMinutes} min</td>
      <td className="px-3 py-2 text-xs">{branch.limitPerRun}</td>
      <td className="px-3 py-2 text-xs">{branch.enabled ? 'Ano' : 'Ne'}</td>
      <td className="px-3 py-2 text-xs text-zinc-600">
        {branch.lastRunAt ? new Date(branch.lastRunAt).toLocaleString('cs-CZ') : '—'}
      </td>
      <td className="px-3 py-2 text-xs">{branch.latestLog?.importedNew ?? 0}</td>
      <td className="px-3 py-2 text-xs">{branch.latestLog?.importedUpdated ?? 0}</td>
      <td className="px-3 py-2 text-xs text-red-700">
        {branch.latestLog?.error ? 1 : 0}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onRun(branch.id)}
            disabled={busy}
            className="rounded bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
          >
            Spustit
          </button>
          <button
            type="button"
            onClick={() => onEdit(branch)}
            disabled={busy}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold"
          >
            Upravit
          </button>
          <button
            type="button"
            onClick={() => onToggle(branch.id, !branch.enabled)}
            disabled={busy}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold"
          >
            {branch.enabled ? 'Vypnout' : 'Zapnout'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(branch.id)}
            disabled={busy}
            className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700"
          >
            Smazat
          </button>
        </div>
        {branch.running?.running ? (
          <div className="mt-2 min-w-[260px] space-y-1">
            <div className="text-[11px] font-medium text-zinc-700">
              {branch.portalLabel ?? branch.portal} / {branch.categoryLabel ?? '—'}
            </div>
            <ImportProgressBar
              percent={branch.running.progressPercent ?? branch.running.percent}
              message={branch.running.currentMessage ?? branch.running.message}
            />
            <div className="text-[11px] text-zinc-600">
              Fáze: {phaseLabelCs(branch.running.phase)}
            </div>
            <div className="text-[11px] text-zinc-600">
              Listingy: {branch.running.processedListings ?? 0} / {branch.running.totalListings ?? 0}
            </div>
            <div className="text-[11px] text-zinc-600">
              Detaily: {branch.running.processedDetails ?? 0} / {branch.running.totalDetails ?? 0}
            </div>
            <div className="text-[11px] text-zinc-600">
              Uloženo: {branch.running.savedCount ?? 0}, aktualizováno: {branch.running.updatedCount ?? 0}, přeskočeno:{' '}
              {branch.running.skippedCount ?? 0}, řádků chyb: {branch.running.errorCount ?? 0}, selhání DB:{' '}
              {branch.running.failedCount ?? 0}
            </div>
            {lastUrl ? (
              <div className="text-[10px] text-zinc-500 break-all" title={lastUrl}>
                Poslední URL: {lastUrl.slice(0, 120)}
                {lastUrl.length > 120 ? '…' : ''}
              </div>
            ) : null}
            {lastErr ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-1.5 text-[10px] text-amber-950">
                <span className="font-semibold">{lastCat ?? 'CHYBA'}:</span> [{lastExt ?? '—'}] {lastErr}
              </div>
            ) : null}
            {(logPayload.length > 0 || (lastImportDebug?.itemErrors?.length ?? 0) > 0) && (
              <button
                type="button"
                onClick={() => setLogOpen(true)}
                className="mt-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-800"
              >
                Zobrazit log chyb ({logPayload.length || lastImportDebug?.itemErrors?.length})
              </button>
            )}
          </div>
        ) : null}
        {!branch.running?.running && lastImportDebug?.itemErrors?.length ? (
          <div className="mt-2 space-y-1">
            <div className="text-[10px] text-zinc-600">
              Poslední běh: nové {lastImportDebug.importedNew ?? 0}, update {lastImportDebug.importedUpdated ?? 0},
              přeskočeno {lastImportDebug.skipped ?? 0}, neplatných {lastImportDebug.skippedInvalid ?? 0}, selhalo{' '}
              {lastImportDebug.failed ?? 0}
            </div>
            {stats ? (
              <div className="text-[10px] text-zinc-600">
                Detaily {Number(stats['detailFetchesCompleted'] ?? 0)} /{' '}
                {Number(stats['detailFetchesAttempted'] ?? 0)}, makléři +{Number(stats['brokersCreated'] ?? 0)} / upd{' '}
                {Number(stats['brokersUpdated'] ?? 0)}, fotky {Number(stats['imagesSaved'] ?? stats['imagesDownloaded'] ?? stats['imagesMirrored'] ?? 0)}, deaktivováno{' '}
                {Number(stats['deactivated'] ?? 0)}
                {Number(stats['mediaPersistFailures'] ?? 0) > 0 ? (
                  <>
                    ,{' '}
                    <span className="font-semibold text-amber-800">
                      PropertyMedia chyby: {Number(stats['mediaPersistFailures'] ?? 0)} (DB_SCHEMA_MISMATCH / IMAGE_SAVE_ERROR)
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
            {Array.isArray(lastImportDebug?.warnings) && lastImportDebug.warnings.length > 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-1.5 text-[10px] text-amber-950">
                {lastImportDebug.warnings.map((w, i) => (
                  <div key={i} className="break-all">
                    {w}
                  </div>
                ))}
              </div>
            ) : null}
            {typeof lastDetailUrl === 'string' && lastDetailUrl ? (
              <div className="text-[10px] text-zinc-500 break-all">
                Poslední detail URL: {lastDetailUrl}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-800"
            >
              Log chyb posledního běhu ({lastImportDebug.itemErrors?.length})
            </button>
          </div>
        ) : null}
      </td>
    </tr>
    {typeof document !== 'undefined' && logOpen
      ? createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div
              role="dialog"
              className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-900">Log chyb importu — {branch.categoryLabel}</h3>
                <button
                  type="button"
                  onClick={() => setLogOpen(false)}
                  className="rounded bg-zinc-900 px-2 py-1 text-xs font-semibold text-white"
                >
                  Zavřít
                </button>
              </div>
              <pre className="whitespace-pre-wrap break-all text-[11px] text-zinc-800">
                {JSON.stringify(logPayload.length ? logPayload : lastImportDebug?.itemErrors ?? [], null, 2)}
              </pre>
            </div>
          </div>,
          document.body,
        )
      : null}
    </>
  );
}
