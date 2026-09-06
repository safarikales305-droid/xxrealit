'use client';

import { useMemo, useState } from 'react';
import type { SrealityImportJobStatus } from '@/lib/sreality-import-admin-api';

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function stageHuman(stage: string): string {
  const map: Record<string, string> = {
    QUEUED: 'Ve frontě',
    STARTING_BROWSER: 'Spouštím browser',
    OPENING_PAGE: 'Otevírám stránku',
    PARSING_SOURCE: 'Parsuji zdroj',
    READING_PROPERTY_DATA: 'Načítám údaje inzerátu',
    FINDING_AGENT: 'Hledám makléře',
    OPENING_CONTACT: 'Otevírám kontakt',
    FINDING_GALLERY: 'Hledám galerii',
    LOADING_GALLERY: 'Načítám galerii',
    CAPTURING_IMAGES: 'Získávám fotografie',
    UPLOADING_IMAGES: 'Ukládám fotografie',
    PREPARING_PREVIEW: 'Připravuji náhled',
    DONE: 'Hotovo',
    PARTIAL: 'Dokončeno s upozorněním',
    FAILED: 'Selhalo',
    CANCELLED: 'Zrušeno',
  };
  return map[stage] ?? stage;
}

function timelineSteps(job: SrealityImportJobStatus) {
  const steps = [
    { key: 'browser', label: 'Browser spuštěn', done: Boolean(job.browserStatus) },
    { key: 'page', label: 'Stránka načtena', done: job.pageStatus === 'LOADED' || job.progress >= 20 },
    { key: 'data', label: 'Základní data nalezena', done: job.progress >= 30 },
    { key: 'agent', label: 'Makléř nalezen', done: job.agentStatus === 'FOUND' },
    {
      key: 'photos',
      label: `Načítám fotografie ${job.imagesProcessed}/${job.imagesSelected || job.imagesFound || '—'}`,
      active: ['CAPTURING_IMAGES', 'LOADING_GALLERY', 'FINDING_GALLERY'].includes(job.stage),
      done: job.imagesImported > 0 && job.stage !== 'CAPTURING_IMAGES',
    },
    {
      key: 'storage',
      label: 'Upload do storage',
      active: job.stage === 'UPLOADING_IMAGES',
      done: job.imagesImported > 0 && !['CAPTURING_IMAGES', 'UPLOADING_IMAGES'].includes(job.stage),
    },
    {
      key: 'preview',
      label: 'Připravuji náhled',
      active: job.stage === 'PREPARING_PREVIEW',
      done: ['DONE', 'PARTIAL'].includes(job.status),
    },
  ];
  return steps;
}

export function SrealityImportProgressPanel({
  job,
  onCancel,
  onRetry,
  onDelete,
  cancelling,
}: {
  job: SrealityImportJobStatus;
  onCancel?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
  cancelling?: boolean;
}) {
  const [showLog, setShowLog] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const steps = useMemo(() => timelineSteps(job), [job]);
  const active = ['QUEUED', 'PROCESSING', 'LONG_RUNNING'].includes(job.status);
  const failed = job.status === 'FAILED';
  const partial = job.status === 'PARTIAL';

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            {failed ? 'Import selhal' : partial ? 'Import dokončen s upozorněním' : active ? 'Importuji inzerát' : 'Import dokončen'}
          </p>
          <p className="mt-1 text-sm text-zinc-600">{job.message ?? stageHuman(job.stage)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-zinc-900">{job.progress} %</p>
          <p className="text-xs text-zinc-500">Doba běhu: {formatElapsed(job.elapsedMs)}</p>
        </div>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            failed ? 'bg-red-500' : partial ? 'bg-amber-500' : 'bg-orange-500'
          }`}
          style={{ width: `${Math.min(100, job.progress)}%` }}
        />
      </div>

      <p className="mt-3 text-sm font-medium text-zinc-800">
        Aktuální krok: {stageHuman(job.stage)}
      </p>

      {job.stageStalledWarning ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Tento krok trvá déle než obvykle ({Math.round(job.stageStalledMs / 1000)} s).
        </p>
      ) : null}

      {job.status === 'LONG_RUNNING' ? (
        <p className="mt-2 text-sm text-zinc-600">Import stále probíhá.</p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
          <p className="font-medium text-zinc-800">Browser</p>
          <p>{job.browserStatus ?? '—'}</p>
          <p className="mt-1 text-zinc-500">Page: {job.pageStatus ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
          <p className="font-medium text-zinc-800">Kontakt</p>
          <p>Makléř: {job.agentStatus ?? '—'}</p>
          <p>Telefon: {job.phoneStatus ?? '—'}</p>
          <p>Email: {job.emailStatus ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
          <p className="font-medium text-zinc-800">Fotografie</p>
          <p>Nalezeno: {job.imagesFound}</p>
          <p>Zpracováno: {job.imagesProcessed}/{job.imagesSelected || '—'}</p>
          <p>Uloženo: {job.imagesImported}</p>
          <p>Selhalo: {job.imagesFailed}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-1 text-sm text-zinc-700">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={
                step.done
                  ? 'text-emerald-600'
                  : step.active
                    ? 'text-orange-600'
                    : 'text-zinc-400'
              }
            >
              {step.done ? '✓' : step.active ? '●' : '○'}
            </span>
            <span>{step.label}</span>
          </li>
        ))}
      </ul>

      {failed ? (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-900">
          <p>
            Fáze: <strong>{stageHuman(job.stage)}</strong>
          </p>
          <p className="mt-1">{job.errorMessage ?? 'Import selhal.'}</p>
          {job.errorCode ? (
            <p className="mt-1 text-xs text-red-700">Technická chyba: {job.errorCode}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {active && onCancel ? (
          <button
            type="button"
            disabled={cancelling}
            onClick={onCancel}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Zrušit import
          </button>
        ) : null}
        {(failed || partial) && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Zkusit znovu
          </button>
        ) : null}
        {(failed || job.status === 'CANCELLED') && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
          >
            Odstranit
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowLog((v) => !v)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
        >
          {showLog ? 'Skrýt průběh' : 'Zobrazit průběh'}
        </button>
        <button
          type="button"
          onClick={() => setShowTech((v) => !v)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
        >
          {showTech ? 'Skrýt diagnostiku' : 'Technická diagnostika'}
        </button>
      </div>

      {showLog ? (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-3 font-mono text-xs text-zinc-700">
          {job.logs.map((entry, idx) => (
            <div key={`${entry.timestamp}-${idx}`} className="py-0.5">
              <span className="text-zinc-400">
                {new Date(entry.timestamp).toLocaleTimeString('cs-CZ')}
              </span>{' '}
              <span className={entry.level === 'error' ? 'text-red-700' : entry.level === 'warn' ? 'text-amber-700' : ''}>
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {showTech ? (
        <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-600">
          <p>stage: {job.stage}</p>
          <p>status: {job.status}</p>
          <p>errorCode: {job.errorCode ?? '—'}</p>
          <p>gallery: {job.galleryStatus ?? '—'}</p>
          {job.diagnostics ? (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(job.diagnostics, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
