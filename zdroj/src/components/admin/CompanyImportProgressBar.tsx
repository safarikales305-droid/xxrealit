'use client';

type Props = {
  title: string;
  status: string;
  percent: number;
  label: string;
  etaSeconds?: number | null;
};

function barColor(status: string): string {
  switch (status) {
    case 'RUNNING':
    case 'PENDING':
      return 'bg-orange-500';
    case 'PAUSE_REQUESTED':
    case 'CANCEL_REQUESTED':
      return 'bg-amber-500';
    case 'PAUSED':
    case 'STOPPED':
      return 'bg-amber-400';
    case 'COMPLETED':
      return 'bg-emerald-500';
    case 'FAILED':
      return 'bg-red-500';
    case 'CANCELLED':
      return 'bg-zinc-500';
    default:
      return 'bg-zinc-400';
  }
}

export function CompanyImportProgressBar({ title, status, percent, label, etaSeconds }: Props) {
  const safePercent = Math.min(100, Math.max(0, percent));
  const isPaused = status === 'PAUSED' || status === 'STOPPED' || status === 'PAUSE_REQUESTED';
  const showEta =
    etaSeconds != null && etaSeconds > 0 && (status === 'RUNNING' || status === 'PENDING');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900">
          {title} – {safePercent} %
        </p>
        {showEta ? (
          <p className="text-xs text-zinc-500">ETA ~{Math.ceil(etaSeconds / 60)} min</p>
        ) : null}
      </div>
      <p className="text-xs text-zinc-600">{label}</p>
      {isPaused ? (
        <p className="text-xs font-medium text-amber-700">⏸ Pozastaveno</p>
      ) : null}
      {status === 'CANCEL_REQUESTED' ? (
        <p className="text-xs font-medium text-amber-700">⏳ Zastavuji…</p>
      ) : null}
      {status === 'CANCELLED' ? (
        <p className="text-xs font-medium text-zinc-600">■ Zastaveno</p>
      ) : null}
      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(status)} ${isPaused ? 'opacity-80' : ''}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
  );
}
