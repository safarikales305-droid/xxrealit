'use client';

import type { AdminImportSourceRow } from '@/lib/nest-client';
import { ImportProgressBar } from './ImportProgressBar';

type Props = {
  branch: AdminImportSourceRow;
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

export function ImportBranchRow({ branch, busy, onRun, onEdit, onToggle, onDelete }: Props) {
  return (
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
              {branch.running.skippedCount ?? 0}, chyby: {branch.running.errorCount ?? 0}
            </div>
          </div>
        ) : null}
      </td>
    </tr>
  );
}
