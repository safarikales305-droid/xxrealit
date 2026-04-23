'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCreateImportSource,
  nestAdminDeleteImportSource,
  nestAdminImportLogs,
  nestAdminImportSources,
  nestAdminRunImportPortal,
  nestAdminRunApifyImportSource,
  nestAdminRunImportSourceStream,
  nestAdminToggleImportSource,
  nestAdminUpdateImportSource,
  type AdminImportLogRow,
  type AdminImportPortalAggregate,
  type AdminImportSourceRow,
  type NestAdminImportRunResult,
} from '@/lib/nest-client';
import { PortalImportSection } from '@/components/admin/imports/PortalImportSection';
import { ImportSourceForm } from '@/components/admin/imports/ImportSourceForm';
import { ImportLogsPanel } from '@/components/admin/imports/ImportLogsPanel';
import { BulkShortsFromImportsSection } from '@/components/admin/imports/BulkShortsFromImportsSection';

type FiltersState = {
  portalKey: string;
  onlyEnabled: boolean;
  onlyRunning: boolean;
  onlyError: boolean;
  search: string;
};

function groupPortalsFromBranches(branches: AdminImportSourceRow[]): AdminImportPortalAggregate[] {
  const map = new Map<string, AdminImportPortalAggregate>();
  for (const b of branches) {
    const key = b.portalKey || b.portal || 'other';
    const prev =
      map.get(key) ??
      {
        portalKey: key,
        portalLabel: b.portalLabel || b.portal || 'Portál',
        branchesTotal: 0,
        branchesEnabled: 0,
        branchesRunning: 0,
        branchesError: 0,
        totalNew: 0,
        totalUpdated: 0,
      };
    prev.branchesTotal += 1;
    if (b.enabled) prev.branchesEnabled += 1;
    if (b.running?.running) prev.branchesRunning += 1;
    if ((b.lastStatus || '').toLowerCase().startsWith('error')) prev.branchesError += 1;
    prev.totalNew += b.latestLog?.importedNew ?? 0;
    prev.totalUpdated += b.latestLog?.importedUpdated ?? 0;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => a.portalLabel.localeCompare(b.portalLabel));
}

export default function AdminImportsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [filters, setFilters] = useState<FiltersState>({
    portalKey: '',
    onlyEnabled: false,
    onlyRunning: false,
    onlyError: false,
    search: '',
  });
  const [portals, setPortals] = useState<AdminImportPortalAggregate[]>([]);
  const [branches, setBranches] = useState<AdminImportSourceRow[]>([]);
  const [logs, setLogs] = useState<AdminImportLogRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importDebugBySource, setImportDebugBySource] = useState<
    Record<string, NestAdminImportRunResult>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editBranch, setEditBranch] = useState<AdminImportSourceRow | null>(null);
  const [defaultPortalKey, setDefaultPortalKey] = useState<string>('reality_cz');

  async function refresh(logFilter?: { sourceId?: string; portalKey?: string; categoryKey?: string }) {
    if (!token) return;
    setError(null);
    const [sourcesData, logsData] = await Promise.all([
      nestAdminImportSources(token, {
        portalKey: filters.portalKey || undefined,
        onlyEnabled: filters.onlyEnabled,
        onlyRunning: filters.onlyRunning,
        onlyError: filters.onlyError,
        search: filters.search || undefined,
      }),
      nestAdminImportLogs(token, logFilter),
    ]);
    if (!sourcesData) {
      setError('Nepodařilo se načíst import source data.');
      return;
    }
    if (Array.isArray(sourcesData)) {
      setBranches(sourcesData);
      setPortals(groupPortalsFromBranches(sourcesData));
    } else {
      setBranches(sourcesData.branches);
      setPortals(sourcesData.portals);
    }
    setLogs(logsData ?? []);
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
  }, [token, user?.role, filters.portalKey, filters.onlyEnabled, filters.onlyRunning, filters.onlyError, filters.search]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminImportSourceRow[]>();
    for (const b of branches) {
      const key = b.portalKey || b.portal || 'other';
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const sa = a.sortOrder ?? 0;
        const sb = b.sortOrder ?? 0;
        if (sa !== sb) return sa - sb;
        return (a.categoryLabel || '').localeCompare(b.categoryLabel || '');
      });
    }
    return map;
  }, [branches]);

  async function runBranch(sourceId: string) {
    if (!token) return;
    setBusyId(sourceId);
    setStatusMsg(null);
    setError(null);
    const branch = branches.find((b) => b.id === sourceId) ?? null;
    if (branch?.method === 'apify') {
      const r = await nestAdminRunApifyImportSource(token, sourceId);
      setBusyId(null);
      if (!r.ok) {
        setError(r.error ?? 'Spuštění APIFY importu selhalo');
        await refresh({ sourceId });
        return;
      }
      if (r.data) {
        setImportDebugBySource((prev) => ({ ...prev, [sourceId]: r.data as NestAdminImportRunResult }));
      }
      setStatusMsg('APIFY import dokončen.');
      await refresh({ sourceId });
      return;
    }
    const r = await nestAdminRunImportSourceStream(token, sourceId, (ev) => {
      if (ev.type !== 'progress') return;
      setBranches((prev) =>
        prev.map((b) =>
          b.id === sourceId
            ? {
                ...b,
                running: {
                  running: true,
                  percent: ev.percent,
                  message: ev.message,
                  phase: ev.phase,
                  totalListings: ev.totalListings,
                  processedListings: ev.processedListings,
                  totalDetails: ev.totalDetails,
                  processedDetails: ev.processedDetails,
                  savedCount: ev.savedCount,
                  updatedCount: ev.updatedCount,
                  skippedCount: ev.skippedCount,
                  errorCount: ev.errorCount,
                  failedCount: ev.failedCount,
                  lastProcessedSourceUrl: ev.lastProcessedSourceUrl,
                  lastItemErrorMessage: ev.lastItemErrorMessage,
                  lastItemErrorCategory: ev.lastItemErrorCategory,
                  lastItemErrorExternalId: ev.lastItemErrorExternalId,
                  itemErrorLog: ev.itemErrorLog,
                  progressPercent: ev.progressPercent ?? ev.percent,
                  currentMessage: ev.currentMessage ?? ev.message,
                },
              }
            : b,
        ),
      );
    });
    setBusyId(null);
    if (r.ok && r.data) {
      setImportDebugBySource((prev) => {
        return {
          ...prev,
          [sourceId]: r.data as NestAdminImportRunResult,
        };
      });
    }
    if (!r.ok) {
      setError(r.error ?? 'Spuštění importu selhalo');
      await refresh({ sourceId });
      return;
    }
    setStatusMsg('Import větve dokončen.');
    await refresh({ sourceId });
  }

  async function runPortal(portalKey: string) {
    if (!token) return;
    setBusyId(`portal:${portalKey}`);
    setStatusMsg(null);
    setError(null);
    const r = await nestAdminRunImportPortal(token, portalKey);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error ?? 'Spuštění portálu selhalo');
      return;
    }
    const failed = (r.data ?? []).filter((x) => !x.ok).length;
    setStatusMsg(
      failed > 0
        ? `Spuštění portálu dokončeno s chybami (${failed} větví).`
        : 'Spuštění portálu dokončeno.',
    );
    await refresh({ portalKey });
  }

  async function toggleBranch(sourceId: string, enabled: boolean) {
    if (!token) return;
    setBusyId(sourceId);
    const r = await nestAdminToggleImportSource(token, sourceId, enabled);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error ?? 'Uložení změny selhalo');
      return;
    }
    await refresh();
  }

  async function deleteBranch(sourceId: string) {
    if (!token) return;
    if (!window.confirm('Opravdu smazat tuto importní větev?')) return;
    setBusyId(sourceId);
    const r = await nestAdminDeleteImportSource(token, sourceId);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error ?? 'Smazání větve selhalo');
      return;
    }
    setStatusMsg('Importní větev byla smazána.');
    await refresh();
  }

  async function submitForm(payload: Record<string, unknown>) {
    if (!token) return;
    const id = typeof payload.id === 'string' ? payload.id : '';
    const method = String(payload.method || 'scraper').toLowerCase();
    const portalKey = String(payload.portalKey || defaultPortalKey || 'other');
    const body: Record<string, unknown> = {
      portalKey,
      portalLabel: payload.portalLabel,
      categoryKey: payload.categoryKey,
      categoryLabel: payload.categoryLabel,
      endpointUrl: payload.endpointUrl,
      actorId: payload.actorId,
      actorTaskId: payload.actorTaskId,
      datasetId: payload.datasetId,
      startUrl: payload.startUrl,
      sourcePortal: payload.sourcePortal,
      notes: payload.notes,
      isActive: payload.isActive,
      credentialsJson: payload.credentialsJson,
      intervalMinutes: payload.intervalMinutes,
      limitPerRun: payload.limitPerRun,
      enabled: payload.enabled,
    };
    if (id) {
      const r = await nestAdminUpdateImportSource(token, id, body);
      if (!r.ok) {
        setError(r.error ?? 'Uložení větve selhalo');
        return;
      }
      setStatusMsg('Větev byla upravena.');
    } else {
      const portalEnum =
        portalKey === 'reality_cz'
          ? 'reality_cz'
          : portalKey === 'century21_cz'
            ? 'century21_cz'
          : portalKey === 'apify'
            ? 'apify'
          : portalKey === 'xml_feed'
            ? 'xml_feed'
            : portalKey === 'csv_feed'
              ? 'csv_feed'
              : 'other';
      const methodEnum =
        method === 'soap'
          ? 'soap'
          : method === 'apify'
            ? 'apify'
          : method === 'xml'
            ? 'xml'
            : method === 'csv'
              ? 'csv'
              : method === 'other'
                ? 'other'
                : 'scraper';
      const r = await nestAdminCreateImportSource(token, {
        portal: portalEnum,
        method: methodEnum,
        name: `${payload.portalLabel ?? portalKey} / ${payload.categoryLabel ?? 'Obecné'}`,
        portalKey,
        portalLabel: payload.portalLabel,
        categoryKey: payload.categoryKey,
        categoryLabel: payload.categoryLabel,
        endpointUrl: payload.endpointUrl,
        actorId: payload.actorId,
        actorTaskId: payload.actorTaskId,
        datasetId: payload.datasetId,
        startUrl: payload.startUrl,
        sourcePortal: payload.sourcePortal,
        notes: payload.notes,
        credentialsJson: payload.credentialsJson,
        isActive: payload.isActive,
        intervalMinutes: payload.intervalMinutes,
        limitPerRun: payload.limitPerRun,
        enabled: payload.enabled,
      });
      if (!r.ok) {
        setError(r.error ?? 'Vytvoření větve selhalo');
        return;
      }
      setStatusMsg('Nová importní větev byla vytvořena.');
    }
    setShowForm(false);
    setEditBranch(null);
    await refresh();
  }

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Načítání…</div>;
  if (!token || !user || user.role !== 'ADMIN') return null;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold">Importy podle portálů a kategorií</h1>
            <p className="text-sm text-zinc-600">
              Přehled škálovatelných větví importu napříč portály.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">Admin</Link>
            <Link href="/admin/inzeraty" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">Inzeráty</Link>
            <Link href="/admin/databaze-makleiru" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">Makléři</Link>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-zinc-600">Všechny portály</span>
              <select
                value={filters.portalKey}
                onChange={(e) => setFilters((p) => ({ ...p, portalKey: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2"
              >
                <option value="">Vše</option>
                {portals.map((p) => (
                  <option key={p.portalKey} value={p.portalKey}>{p.portalLabel}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-zinc-600">Vyhledávání</span>
              <input
                value={filters.search}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                placeholder="portál / kategorie / URL"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filters.onlyEnabled} onChange={(e) => setFilters((p) => ({ ...p, onlyEnabled: e.target.checked }))} />
              <span>Jen aktivní</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filters.onlyRunning} onChange={(e) => setFilters((p) => ({ ...p, onlyRunning: e.target.checked }))} />
              <span>Jen běžící</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filters.onlyError} onChange={(e) => setFilters((p) => ({ ...p, onlyError: e.target.checked }))} />
              <span>Jen s chybou</span>
            </label>
          </div>
        </section>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {statusMsg ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{statusMsg}</p> : null}

        {portals.map((portal) => (
          <PortalImportSection
            key={portal.portalKey}
            portal={portal}
            branches={grouped.get(portal.portalKey) ?? []}
            importDebugBySource={importDebugBySource}
            busyId={busyId}
            onRunPortal={(key) => void runPortal(key)}
            onAddBranch={(key) => {
              setDefaultPortalKey(key);
              setEditBranch(null);
              setShowForm(true);
            }}
            onRunBranch={(id) => void runBranch(id)}
            onEditBranch={(branch) => {
              setEditBranch(branch);
              setDefaultPortalKey(branch.portalKey || 'reality_cz');
              setShowForm(true);
            }}
            onToggleBranch={(id, enabled) => void toggleBranch(id, enabled)}
            onDeleteBranch={(id) => void deleteBranch(id)}
          />
        ))}

        <BulkShortsFromImportsSection token={token} branches={branches} />

        <ImportLogsPanel logs={logs} />
      </div>
      <ImportSourceForm
        open={showForm}
        branch={editBranch}
        defaultPortalKey={defaultPortalKey}
        onClose={() => {
          setShowForm(false);
          setEditBranch(null);
        }}
        onSubmit={(payload) => void submitForm(payload)}
      />
    </div>
  );
}
