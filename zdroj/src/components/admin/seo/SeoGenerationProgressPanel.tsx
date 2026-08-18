'use client';

import Link from 'next/link';

export type SeoJobProgressItem = {
  order?: number;
  id: string;
  status: string;
  localityName?: string | null;
  localitySlug?: string | null;
  intentSlug?: string | null;
  offerType?: string | null;
  propertyType?: string | null;
  phase?: string | null;
  attempt?: number;
  qualityScore?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  seoPageId?: string | null;
  companyName?: string | null;
};

export type SeoJobProgressView = {
  id: string;
  status: string;
  requestedCount: number;
  processedCount: number;
  createdCount?: number;
  updatedCount?: number;
  reviewCount?: number;
  errorCount?: number;
  failedCount?: number;
  skippedCount?: number;
  progressPct?: number;
  currentItem?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastActivityAt?: string | null;
  lastError?: string | null;
  pauseReason?: string | null;
  type?: string;
};

export type SeoWorkerStatus = {
  online: boolean;
  lastHeartbeat: string | null;
  heartbeatAgeMs?: number | null;
};

type Props = {
  title: string;
  job: SeoJobProgressView;
  items?: SeoJobProgressItem[];
  worker?: SeoWorkerStatus | null;
  staleWarning?: boolean;
  busy?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRecover?: () => void;
  itemLabel?: (item: SeoJobProgressItem) => string;
  previewHref?: (item: SeoJobProgressItem) => string | null;
};

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'ČEKÁ',
    RUNNING: 'BĚŽÍ',
    PAUSED: 'POZASTAVENO',
    COMPLETED: 'DOKONČENO',
    PARTIAL: 'ČÁSTEČNĚ',
    FAILED: 'CHYBA',
    CANCELLED: 'ZRUŠENO',
  };
  return map[status] ?? status;
}

function itemStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Čeká',
    RUNNING: 'Běží',
    COMPLETED: 'Hotovo',
    REVIEW: 'Ke kontrole',
    REGENERATED: 'Regenerováno',
    FAILED: 'Chyba',
    SKIPPED: 'Přeskočeno',
  };
  return map[status] ?? status;
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `před ${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 120) return `před ${min} min`;
  return new Date(iso).toLocaleString('cs-CZ');
}

export function SeoGenerationProgressPanel({
  title,
  job,
  items = [],
  worker,
  staleWarning,
  busy,
  onPause,
  onResume,
  onCancel,
  onRecover,
  itemLabel,
  previewHref,
}: Props) {
  const pct = job.progressPct ?? (job.requestedCount ? Math.round((job.processedCount / job.requestedCount) * 100) : 0);
  const isActive = ['PENDING', 'RUNNING', 'PAUSED'].includes(job.status);
  const isDone = ['COMPLETED', 'PARTIAL'].includes(job.status);
  const failed = job.failedCount ?? job.errorCount ?? 0;

  return (
    <div className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{title}</p>
          <p className="mt-1 text-lg font-bold text-zinc-900">
            {isDone ? '✓ Generování dokončeno' : `Stav: ${statusLabel(job.status)}`}
          </p>
        </div>
        {worker ? (
          <div className="text-right text-xs text-zinc-600">
            <p>
              Worker:{' '}
              <span className={worker.online ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
                {worker.online ? 'ONLINE' : 'OFFLINE'}
              </span>
            </p>
            <p>Heartbeat: {formatRelativeTime(worker.lastHeartbeat)}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full transition-all ${isDone ? 'bg-green-500' : 'bg-violet-600'}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <p className="mt-2 text-sm font-semibold text-zinc-900">
          {job.processedCount} / {job.requestedCount} dokončeno · {pct} %
        </p>
        {job.requestedCount === 0 ? (
          <p className="mt-1 text-xs font-medium text-red-700">
            Úloha nemá žádné položky — použijte Obnovit nebo spusťte novou dávku.
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Úspěšně" value={job.createdCount ?? 0} />
        <Stat label="Ke kontrole" value={job.reviewCount ?? 0} />
        <Stat label="Chyby" value={failed} warn={failed > 0} />
        <Stat label="Přeskočeno" value={job.skippedCount ?? 0} />
      </div>

      {job.currentItem && isActive ? (
        <p className="mt-3 text-sm text-zinc-700">
          <span className="font-medium">Aktuálně:</span> {job.currentItem}
        </p>
      ) : null}

      {job.startedAt ? (
        <p className="mt-2 text-xs text-zinc-500">
          Spuštěno: {new Date(job.startedAt).toLocaleString('cs-CZ')}
          {job.lastActivityAt ? ` · Poslední aktivita: ${formatRelativeTime(job.lastActivityAt)}` : null}
        </p>
      ) : null}

      {staleWarning ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ Worker nereaguje — úloha může být zaseknutá.
          {onRecover ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRecover}
              className="ml-2 font-semibold text-amber-800 underline"
            >
              Obnovit úlohu
            </button>
          ) : null}
        </div>
      ) : null}

      {job.lastError ? (
        <p className="mt-2 text-xs text-red-700">Poslední chyba: {job.lastError}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {job.status === 'RUNNING' && onPause ? (
          <ActionBtn disabled={busy} onClick={onPause}>
            Pozastavit
          </ActionBtn>
        ) : null}
        {job.status === 'PAUSED' && onResume ? (
          <ActionBtn disabled={busy} onClick={onResume}>
            Pokračovat
          </ActionBtn>
        ) : null}
        {isActive && onCancel ? (
          <ActionBtn disabled={busy} variant="danger" onClick={onCancel}>
            Zastavit
          </ActionBtn>
        ) : null}
        {isDone ? (
          <Link
            href={job.type?.includes('COMPANY') || title.includes('firm') ? '/admin/seo/firmy' : '/admin/seo/stranky'}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            Zobrazit vytvořené stránky
          </Link>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b text-zinc-500">
                <th className="py-1 pr-2">Lokalita</th>
                <th className="py-1 pr-2">Typ</th>
                <th className="py-1 pr-2">Stav</th>
                <th className="py-1 pr-2">Čas</th>
                <th className="py-1 pr-2">Kvalita</th>
                <th className="py-1 pr-2">Chyba</th>
                <th className="py-1 pr-2">Akce</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const label =
                  itemLabel?.(item) ??
                  item.localityName ??
                  item.companyName ??
                  item.localitySlug ??
                  '—';
                const type =
                  item.propertyType && item.offerType
                    ? `${item.offerType} / ${item.propertyType}`
                    : item.intentSlug ?? '—';
                const preview = previewHref?.(item);
                return (
                  <tr key={item.id} className="border-b border-zinc-100">
                    <td className="py-1 pr-2">{label}</td>
                    <td className="py-1 pr-2">{type}</td>
                    <td className="py-1 pr-2">{itemStatusLabel(item.status)}</td>
                    <td className="py-1 pr-2">
                      {item.durationMs != null ? `${Math.round(item.durationMs / 1000)} s` : '—'}
                    </td>
                    <td className="py-1 pr-2">{item.qualityScore ?? '—'}</td>
                    <td className="py-1 pr-2 max-w-[140px] truncate text-red-700">
                      {item.errorCode ?? '—'}
                    </td>
                    <td className="py-1 pr-2">
                      {preview ? (
                        <Link href={preview} className="font-semibold text-orange-700 hover:underline">
                          Náhled
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${warn ? 'text-red-600' : 'text-zinc-900'}`}>{value}</p>
    </div>
  );
}

function ActionBtn({
  children,
  disabled,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
        variant === 'danger'
          ? 'border-red-200 text-red-700'
          : 'border-violet-200 text-violet-900'
      }`}
    >
      {children}
    </button>
  );
}
