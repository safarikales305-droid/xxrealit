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
      return 'bg-orange-500';
    case 'PAUSED':
      return 'bg-amber-400';
    case 'COMPLETED':
      return 'bg-emerald-500';
    case 'FAILED':
      return 'bg-red-500';
    default:
      return 'bg-zinc-400';
  }
}

export function CompanyImportProgressBar({ title, status, percent, label, etaSeconds }: Props) {
  const safePercent = Math.min(100, Math.max(0, percent));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900">
          {title} – {safePercent} %
        </p>
        {etaSeconds != null && etaSeconds > 0 && status === 'RUNNING' ? (
          <p className="text-xs text-zinc-500">ETA ~{Math.ceil(etaSeconds / 60)} min</p>
        ) : null}
      </div>
      <p className="text-xs text-zinc-600">{label}</p>
      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(status)}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
  );
}
