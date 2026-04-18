'use client';

type Props = {
  percent: number;
  message?: string;
};

export function ImportProgressBar({ percent, message }: Props) {
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
    </div>
  );
}
