'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  nestAdminSeoLocationImportPreview,
  nestAdminSeoLocationImportRun,
  nestAdminSeoLocationImports,
  nestAdminSeoLocationSaveMappings,
  nestAdminSeoLocationSourceTest,
  nestAdminSeoLocationSourceUpdate,
  nestAdminSeoLocationSources,
  nestAdminSeoLocationSyncCsu,
  nestAdminSeoLocationSyncRuian,
  nestAdminSeoLocationUpload,
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [logSourceId, setLogSourceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [wizard, setWizard] = useState<{
    sourceId: string;
    step: number;
    uploadId?: string;
    mapping: Record<string, string>;
    preview?: Record<string, unknown>;
    filename?: string;
    rowCount?: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(async () => {
    const res = await nestAdminSeoLocationSources(token);
    if (res) setSources(res);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ruian = sources.find((s) => s.type === 'RUIAN');
  const csu = sources.find((s) => s.type === 'CSU');
  const hasAnySource = sources.length > 0;

  async function handleTest(sourceId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await nestAdminSeoLocationSourceTest(token, sourceId);
      setMsg(res?.ok ? 'Zdroj je dostupný.' : res?.message ?? 'Test selhal.');
      void refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function handleSync(type: 'RUIAN' | 'CSU', dryRun = false) {
    setBusy(true);
    setMsg(null);
    try {
      const res =
        type === 'RUIAN'
          ? await nestAdminSeoLocationSyncRuian(token, dryRun)
          : await nestAdminSeoLocationSyncCsu(token, dryRun);
      setMsg(
        dryRun
          ? `Testovací sync: +${res?.inserted ?? 0} / ~${res?.updated ?? 0} aktualizací`
          : `Synchronizace dokončena: +${res?.inserted ?? 0} nových, ${res?.updated ?? 0} aktualizovaných`,
      );
      void refresh();
      onImported?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Synchronizace selhala');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File, sourceId?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await nestAdminSeoLocationUpload(token, file, sourceId);
      if (res) {
        setWizard({
          sourceId: sourceId ?? sources[0]?.id ?? '',
          step: 3,
          uploadId: res.uploadId,
          mapping: res.suggestedMapping,
          filename: res.filename,
          rowCount: res.rowCount,
        });
        setMsg(`Nahráno ${res.filename} — ${res.rowCount} řádků`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Upload selhal');
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!wizard?.uploadId) return;
    setBusy(true);
    try {
      const preview = await nestAdminSeoLocationImportPreview(token, {
        uploadId: wizard.uploadId,
        sourceId: wizard.sourceId,
        mapping: wizard.mapping,
      });
      setWizard({ ...wizard, step: 5, preview: preview ?? undefined });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Náhled selhal');
    } finally {
      setBusy(false);
    }
  }

  async function runImport(dryRun: boolean) {
    if (!wizard?.uploadId) return;
    setBusy(true);
    try {
      await nestAdminSeoLocationSaveMappings(
        token,
        wizard.sourceId,
        Object.entries(wizard.mapping).map(([sourceField, targetField]) => ({ sourceField, targetField })),
      );
      const res = await nestAdminSeoLocationImportRun(token, {
        uploadId: wizard.uploadId,
        sourceId: wizard.sourceId,
        mapping: wizard.mapping,
        dryRun,
      });
      setMsg(
        dryRun
          ? `Testovací import: +${res?.inserted ?? 0}, ~${res?.updated ?? 0} aktualizací`
          : `Import dokončen: +${res?.inserted ?? 0} nových`,
      );
      if (!dryRun) {
        setWizard(null);
        onImported?.();
        void refresh();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Import selhal');
    } finally {
      setBusy(false);
    }
  }

  async function openLogs(sourceId: string) {
    setLogSourceId(sourceId);
    const res = await nestAdminSeoLocationImports(token, sourceId);
    setLogs(res ?? []);
  }

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">Datové zdroje lokalit</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-xs font-medium"
            onClick={() => ruian && setSettingsId(ruian.id)}
          >
            + Přidat zdroj RÚIAN
          </button>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-xs font-medium"
            onClick={() => csu && setSettingsId(csu.id)}
          >
            + Přidat zdroj ČSÚ
          </button>
          <button
            type="button"
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => fileRef.current?.click()}
          >
            Nahrát soubor
          </button>
          <button
            type="button"
            className="rounded-lg border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-700"
            onClick={() => fileRef.current?.click()}
          >
            Spustit testovací import
          </button>
        </div>
      </div>

      {!hasAnySource ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Zatím není nastaven žádný zdroj dat. Přidejte RÚIAN nebo ČSÚ, nebo nahrajte CSV/XML/ZIP.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {ruian ? (
          <SourceCard
            source={ruian}
            busy={busy}
            onTest={() => void handleTest(ruian.id)}
            onSync={() => void handleSync('RUIAN')}
            onDrySync={() => void handleSync('RUIAN', true)}
            onSettings={() => setSettingsId(ruian.id)}
            onLogs={() => void openLogs(ruian.id)}
          />
        ) : null}
        {csu ? (
          <SourceCard
            source={csu}
            busy={busy}
            onTest={() => void handleTest(csu.id)}
            onSync={() => void handleSync('CSU')}
            onDrySync={() => void handleSync('CSU', true)}
            onSettings={() => setSettingsId(csu.id)}
            onLogs={() => void openLogs(csu.id)}
          />
        ) : null}
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed p-6 text-center text-sm transition ${
          dragOver ? 'border-orange-400 bg-orange-50' : 'border-zinc-200 bg-zinc-50'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleUpload(file, ruian?.id);
        }}
      >
        Přetáhněte CSV, JSON, XML, ZIP nebo GZ (max 50 MB)
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,.xml,.zip,.gz,.gml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file, ruian?.id);
          }}
        />
      </div>

      {msg ? <p className="rounded-lg border bg-white px-3 py-2 text-sm">{msg}</p> : null}

      {settingsId ? (
        <SourceSettingsModal
          source={sources.find((s) => s.id === settingsId)!}
          onClose={() => setSettingsId(null)}
          onSave={async (patch) => {
            await nestAdminSeoLocationSourceUpdate(token, settingsId, patch);
            setSettingsId(null);
            void refresh();
          }}
        />
      ) : null}

      {wizard ? (
        <ImportWizard
          wizard={wizard}
          sources={sources}
          busy={busy}
          onMappingChange={(mapping) => setWizard({ ...wizard, mapping })}
          onPreview={() => void runPreview()}
          onDryRun={() => void runImport(true)}
          onRun={() => void runImport(false)}
          onClose={() => setWizard(null)}
        />
      ) : null}

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
                <span>{String(l.status)}</span>
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

function SourceCard({
  source,
  busy,
  onTest,
  onSync,
  onDrySync,
  onSettings,
  onLogs,
}: {
  source: SeoLocationSourceCard;
  busy: boolean;
  onTest: () => void;
  onSync: () => void;
  onDrySync: () => void;
  onSettings: () => void;
  onLogs: () => void;
}) {
  const statusClass = STATUS_COLORS[source.lastStatus] ?? STATUS_COLORS.idle;
  return (
    <div className={`rounded-2xl border p-4 ${statusClass}`}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{source.type}</p>
          <h3 className="text-lg font-bold">{source.name}</h3>
        </div>
        <span className="rounded-full px-2 py-0.5 text-xs font-medium capitalize">{source.lastStatus}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-zinc-600">Režim</dt>
        <dd>{source.sourceMode}</dd>
        <dt className="text-zinc-600">Poslední sync</dt>
        <dd>{source.lastSyncAt ? new Date(source.lastSyncAt).toLocaleString('cs-CZ') : '—'}</dd>
        <dt className="text-zinc-600">Importováno</dt>
        <dd>{source.importedCount.toLocaleString('cs-CZ')}</dd>
        <dt className="text-zinc-600">Aktualizováno</dt>
        <dd>{source.updatedCount.toLocaleString('cs-CZ')}</dd>
        <dt className="text-zinc-600">Chyby</dt>
        <dd>{source.errorCount}</dd>
        <dt className="text-zinc-600">Verze dat</dt>
        <dd>{source.lastDataVersion ?? '—'}</dd>
        <dt className="text-zinc-600">Poslední import</dt>
        <dd>{source.lastImport?.status ?? '—'}</dd>
      </dl>
      {source.lastError ? <p className="mt-2 text-xs text-red-700">{source.lastError}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onSync} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50">
          Synchronizovat nyní
        </button>
        <button type="button" disabled={busy} onClick={onTest} className="rounded-lg border px-3 py-1.5 text-xs">
          Otestovat zdroj
        </button>
        <button type="button" disabled={busy} onClick={onDrySync} className="rounded-lg border px-3 py-1.5 text-xs">
          Test import
        </button>
        <button type="button" onClick={onLogs} className="rounded-lg border px-3 py-1.5 text-xs">
          Zobrazit log
        </button>
        <button type="button" onClick={onSettings} className="rounded-lg border px-3 py-1.5 text-xs">
          Nastavení
        </button>
      </div>
    </div>
  );
}

function SourceSettingsModal({
  source,
  onClose,
  onSave,
}: {
  source: SeoLocationSourceCard;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [url, setUrl] = useState(source.sourceUrl ?? '');
  const [mode, setMode] = useState(source.sourceMode);
  const [fileType, setFileType] = useState(source.fileType ?? 'CSV');
  const [autoSync, setAutoSync] = useState(source.autoSync);
  const [interval, setInterval] = useState(source.syncIntervalMinutes);
  const config = source.config ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold">Nastavení — {source.type}</h3>
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            Režim zdroje
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5">
              <option value="OFFICIAL_URL">Oficiální veřejná URL</option>
              <option value="REMOTE_URL">Vlastní URL XML/CSV/ZIP</option>
              <option value="UPLOAD">Ruční nahrání souboru</option>
            </select>
          </label>
          <label className="block">
            URL zdroje
            <input value={url} onChange={(e) => setUrl(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs" />
          </label>
          <label className="block">
            Typ souboru
            <select value={fileType} onChange={(e) => setFileType(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5">
              {['CSV', 'JSON', 'XML', 'ZIP', 'GML'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
            Automatická synchronizace
          </label>
          <label className="block">
            Interval (minuty)
            <input type="number" value={interval} onChange={(e) => setInterval(Number(e.target.value))} className="mt-1 w-full rounded border px-2 py-1.5" />
          </label>
          <p className="text-xs text-zinc-500">
            ETag: {source.lastEtag ?? '—'} · Last-Modified: {source.lastModified ?? '—'}
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            Zrušit
          </button>
          <button
            type="button"
            className="rounded bg-orange-600 px-3 py-1.5 text-sm text-white"
            onClick={() =>
              void onSave({
                sourceMode: mode,
                sourceUrl: url,
                fileType,
                autoSync,
                syncIntervalMinutes: interval,
                configJson: {
                  ...config,
                  encoding: 'utf-8',
                  csvDelimiter: ';',
                  timeoutMs: 60000,
                },
              })
            }
          >
            Uložit
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportWizard({
  wizard,
  sources,
  busy,
  onMappingChange,
  onPreview,
  onDryRun,
  onRun,
  onClose,
}: {
  wizard: {
    sourceId: string;
    step: number;
    uploadId?: string;
    mapping: Record<string, string>;
    preview?: Record<string, unknown>;
    filename?: string;
    rowCount?: number;
  };
  sources: SeoLocationSourceCard[];
  busy: boolean;
  onMappingChange: (m: Record<string, string>) => void;
  onPreview: () => void;
  onDryRun: () => void;
  onRun: () => void;
  onClose: () => void;
}) {
  const source = sources.find((s) => s.id === wizard.sourceId);
  const stats = (wizard.preview?.stats ?? {}) as Record<string, number>;
  const steps = ['Zdroj', 'Upload', 'Mapování', 'Validace', 'Náhled', 'Import'];

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Importní průvodce — {wizard.filename}</h3>
        <button type="button" onClick={onClose} className="text-sm text-zinc-500">
          Zavřít
        </button>
      </div>
      <div className="mb-4 flex flex-wrap gap-1 text-xs">
        {steps.map((s, i) => (
          <span key={s} className={`rounded px-2 py-0.5 ${i + 1 <= wizard.step ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100'}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      <p className="mb-3 text-sm text-zinc-600">
        Soubor: {wizard.filename} · {wizard.rowCount?.toLocaleString('cs-CZ')} řádků · zdroj {source?.type ?? '—'}
      </p>

      <div className="mb-4 space-y-2">
        <p className="text-sm font-medium">Mapování polí</p>
        {Object.entries(wizard.mapping).map(([src, tgt]) => (
          <div key={src} className="flex gap-2 text-xs">
            <span className="w-1/2 font-mono">{src}</span>
            <span>→</span>
            <select
              value={tgt}
              onChange={(e) => onMappingChange({ ...wizard.mapping, [src]: e.target.value })}
              className="flex-1 rounded border px-1 py-0.5"
            >
              {(source?.targetFields ?? []).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {wizard.preview ? (
        <div className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <Stat label="Přidáno" value={stats.inserted} />
          <Stat label="Aktualizováno" value={stats.updated} />
          <Stat label="Přeskočeno" value={stats.skipped} />
          <Stat label="Deaktivováno" value={stats.deactivated} />
          <Stat label="Chyby" value={stats.errors} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onPreview} className="rounded border px-3 py-1.5 text-sm">
          Náhled změn
        </button>
        <button type="button" disabled={busy} onClick={onDryRun} className="rounded border border-orange-300 px-3 py-1.5 text-sm text-orange-700">
          Testovací import
        </button>
        <button type="button" disabled={busy} onClick={onRun} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
          Zahájit import
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border bg-zinc-50 p-2 text-center">
      <p className="text-lg font-bold">{value ?? 0}</p>
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}
