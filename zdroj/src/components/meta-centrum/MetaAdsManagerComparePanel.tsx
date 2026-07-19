'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  nestAdminMetaCenterAdsManagerCompare,
  nestAdminMetaCenterCloneFromAdsManager,
  type MetaAdsManagerCompareResult,
  type MetaAdsManagerDiffRow,
  type MetaAdsManagerLayerCompare,
  type MetaCampaignDraft,
} from '@/lib/nest-client';

const LAYER_LABELS: Record<MetaAdsManagerLayerCompare['layer'], string> = {
  campaign: 'Campaign',
  adSet: 'Ad Set',
  creative: 'Creative',
  ad: 'Ad',
};

type Props = {
  token: string | null;
  draft: MetaCampaignDraft | null;
  onDraftUpdated?: (draft: MetaCampaignDraft) => void;
};

function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function DiffStatusBadge({ status }: { status: MetaAdsManagerDiffRow['status'] }) {
  if (status === 'match') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        🟢 stejné
      </span>
    );
  }
  if (status === 'different') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
        🟡 jiné
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
      🔴 chybí
    </span>
  );
}

function DiffRowView({ row }: { row: MetaAdsManagerDiffRow }) {
  const bg =
    row.status === 'match'
      ? 'bg-emerald-50/60'
      : row.status === 'different'
        ? 'bg-amber-50/60'
        : 'bg-red-50/60';

  return (
    <div className={`rounded-lg border border-zinc-200/80 p-3 font-mono text-xs ${bg}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <code className="font-semibold text-zinc-800">{row.path}</code>
        <DiffStatusBadge status={row.status} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            XXREALIT
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-white/80 p-2 text-[11px] text-zinc-700">
            {formatValue(row.xxrealit)}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Ads Manager
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-white/80 p-2 text-[11px] text-zinc-700">
            {formatValue(row.adsManager)}
          </pre>
        </div>
      </div>
      {row.status === 'missing' && row.missingSide ? (
        <p className="mt-2 text-[11px] text-zinc-600">
          Chybí na straně:{' '}
          <strong>{row.missingSide === 'xxrealit' ? 'XXREALIT' : 'Ads Manager'}</strong>
        </p>
      ) : null}
    </div>
  );
}

function LayerSection({ layer }: { layer: MetaAdsManagerLayerCompare }) {
  const [open, setOpen] = useState(true);
  const nonMatch = layer.diff.filter((d) => d.status !== 'match');

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <h3 className="font-semibold text-zinc-900">{LAYER_LABELS[layer.layer]}</h3>
          <p className="text-xs text-zinc-500">
            🟢 {layer.matchCount} · 🟡 {layer.differentCount} · 🔴 {layer.missingCount}
          </p>
        </div>
        <span className="text-sm text-zinc-400">{open ? '▼' : '▶'}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-zinc-100 px-4 py-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">XXREALIT JSON</p>
              <pre className="max-h-56 overflow-auto rounded-lg bg-zinc-50 p-3 text-[11px]">
                {formatValue(layer.xxrealit)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">Ads Manager JSON</p>
              <pre className="max-h-56 overflow-auto rounded-lg bg-zinc-50 p-3 text-[11px]">
                {formatValue(layer.adsManager)}
              </pre>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-800">
              Diff ({nonMatch.length > 0 ? `${nonMatch.length} rozdílů` : 'vše shodné'})
            </p>
            {layer.diff.length === 0 ? (
              <p className="text-sm text-zinc-500">Žádná data k porovnání.</p>
            ) : (
              layer.diff.map((row) => <DiffRowView key={`${layer.layer}-${row.path}`} row={row} />)
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function MetaAdsManagerComparePanel({ token, draft, onDraftUpdated }: Props) {
  const [adId, setAdId] = useState(draft?.metaAdId ?? '');
  const [safeMode, setSafeMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [result, setResult] = useState<MetaAdsManagerCompareResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canRun = Boolean(token && draft?.id && adId.trim());

  const exportBundle = useMemo(() => {
    if (!result) return null;
    return {
      exportedAt: new Date().toISOString(),
      safeMode: result.safeMode,
      adId: result.adId,
      metaIds: result.metaIds,
      summary: result.summary,
      xxrealit: result.xxrealit,
      adsManager: result.adsManager,
      layers: result.layers,
    };
  }, [result]);

  const runCompare = useCallback(async () => {
    if (!token || !draft?.id || !adId.trim()) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await nestAdminMetaCenterAdsManagerCompare(token, draft.id, {
      adId: adId.trim(),
      safeMode,
    });
    setBusy(false);
    setResult(r);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setMsg(r.message);
  }, [token, draft?.id, adId, safeMode]);

  const runClone = useCallback(async () => {
    if (!token || !draft?.id || !adId.trim()) return;
    setCloneBusy(true);
    setErr(null);
    const r = await nestAdminMetaCenterCloneFromAdsManager(token, draft.id, {
      adId: adId.trim(),
      safeMode,
    });
    setCloneBusy(false);
    if (!r.ok) {
      setErr(r.message ?? 'Klonování selhalo');
      return;
    }
    setMsg(r.message ?? 'Payload zkopírován.');
    if (r.campaign) onDraftUpdated?.(r.campaign);
    void runCompare();
  }, [token, draft?.id, adId, safeMode, onDraftUpdated, runCompare]);

  async function copyExport() {
    if (!exportBundle) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportBundle, null, 2));
      setMsg('JSON export zkopírován do schránky.');
    } catch {
      setErr('Kopírování selhalo');
    }
  }

  function downloadExport() {
    if (!exportBundle) return;
    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meta-ads-manager-compare-${adId || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold text-zinc-900">Porovnání s Ads Manager</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Načte ručně vytvořenou reklamu přes Marketing API, exportuje JSON všech vrstev a porovná je
          s payloadem XXREALIT.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label htmlFor="meta-ad-id" className="mb-1 block text-sm font-medium text-zinc-700">
              ID reklamy z Ads Manager
            </label>
            <input
              id="meta-ad-id"
              value={adId}
              onChange={(e) => setAdId(e.target.value)}
              placeholder="např. 120212345678901234"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 font-mono text-sm"
            />
            {draft?.metaAdId ? (
              <p className="mt-1 text-xs text-zinc-500">
                Z konceptu: <code>{draft.metaAdId}</code>
                {draft.metaCampaignId ? ` · Campaign ${draft.metaCampaignId}` : ''}
              </p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={safeMode}
              onChange={(e) => setSafeMode(e.target.checked)}
            />
            Safe Mode (pouze oficiální pole Meta API)
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canRun || busy}
            onClick={() => void runCompare()}
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Načítám…' : 'Porovnat s Ads Manager'}
          </button>
          <button
            type="button"
            disabled={!canRun || cloneBusy}
            onClick={() => void runClone()}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
          >
            {cloneBusy ? 'Klonuji…' : 'Klonovat přesně jako Ads Manager'}
          </button>
          {exportBundle ? (
            <>
              <button
                type="button"
                onClick={() => void copyExport()}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm"
              >
                Kopírovat JSON
              </button>
              <button
                type="button"
                onClick={downloadExport}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm"
              >
                Stáhnout JSON
              </button>
            </>
          ) : null}
        </div>

        {msg ? <p className="mt-3 text-sm text-emerald-700">{msg}</p> : null}
        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
      </section>

      {result?.ok ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{result.summary.match}</p>
              <p className="text-xs text-zinc-600">🟢 stejné</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{result.summary.different}</p>
              <p className="text-xs text-zinc-600">🟡 jiné</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{result.summary.missing}</p>
              <p className="text-xs text-zinc-600">🔴 chybí</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold">{result.summary.total}</p>
              <p className="text-xs text-zinc-600">polí celkem</p>
            </div>
          </div>

          <div className="space-y-4">
            {result.layers.map((layer) => (
              <LayerSection key={layer.layer} layer={layer} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
