'use client';

type Props = {
  percent: number;
  message?: string;
  processed?: number;
  total?: number | null;
  etaSeconds?: number | null;
  stalled?: boolean;
};

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} min ${s} s`;
}

export function ImportProgressBar({ percent, message, processed, total, etaSeconds, stalled }: Props) {
  const p = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
        <span className="truncate pr-3">{message || 'Běh importu'}</span>
        <span className="font-semibold text-zinc-900">{p}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 ease-out"
          style={{ width: `${p}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-zinc-600">
        {typeof total === 'number' && total > 0 && typeof processed === 'number'
          ? `${p} % (${processed} / ${total})`
          : 'Načítám...'}
      </div>
      <div className="text-[11px] text-zinc-600">
        {stalled
          ? 'Zpracovávám...'
          : typeof etaSeconds === 'number' && etaSeconds > 0
            ? `⏱ zbývá cca ${formatEta(etaSeconds)}`
            : p >= 100
              ? 'Dokončeno'
              : 'Zpracovávám...'}
      </div>
    </div>
  );
}
