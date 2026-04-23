'use client';

import type {
  AdminImportPortalAggregate,
  AdminImportSourceRow,
  NestAdminImportRunResult,
} from '@/lib/nest-client';
import { ImportBranchRow } from './ImportBranchRow';

type Props = {
  portal: AdminImportPortalAggregate;
  branches: AdminImportSourceRow[];
  importDebugBySource?: Record<string, NestAdminImportRunResult>;
  busyId?: string | null;
  onRunPortal: (portalKey: string) => void;
  onAddBranch: (portalKey: string) => void;
  onRunBranch: (sourceId: string) => void;
  onEditBranch: (branch: AdminImportSourceRow) => void;
  onToggleBranch: (sourceId: string, enabled: boolean) => void;
  onDeleteBranch: (sourceId: string) => void;
};

export function PortalImportSection({
  portal,
  branches,
  importDebugBySource,
  busyId,
  onRunPortal,
  onAddBranch,
  onRunBranch,
  onEditBranch,
  onToggleBranch,
  onDeleteBranch,
}: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">PORTÁL: {portal.portalLabel}</h2>
          <p className="text-xs text-zinc-600">
            Větve {portal.branchesTotal}, aktivní {portal.branchesEnabled}, běží {portal.branchesRunning}, chyby {portal.branchesError}, nové {portal.totalNew}, update {portal.totalUpdated}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onRunPortal(portal.portalKey)}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white"
          >
            Spustit vše
          </button>
          <button
            type="button"
            onClick={() => onAddBranch(portal.portalKey)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold"
          >
            Přidat větev
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1250px] w-full text-left">
          <thead className="bg-zinc-50 text-[11px] uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Kategorie</th>
              <th className="px-3 py-2">Typ zdroje</th>
              <th className="px-3 py-2">Start URL</th>
              <th className="px-3 py-2">Interval</th>
              <th className="px-3 py-2">Limit</th>
              <th className="px-3 py-2">Aktivní</th>
              <th className="px-3 py-2">Poslední běh</th>
              <th className="px-3 py-2">Nové</th>
              <th className="px-3 py-2">Update</th>
              <th className="px-3 py-2">Chyby</th>
              <th className="px-3 py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <ImportBranchRow
                key={b.id}
                branch={b}
                lastImportDebug={importDebugBySource?.[b.id]}
                busy={busyId === b.id}
                onRun={onRunBranch}
                onEdit={onEditBranch}
                onToggle={onToggleBranch}
                onDelete={onDeleteBranch}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
