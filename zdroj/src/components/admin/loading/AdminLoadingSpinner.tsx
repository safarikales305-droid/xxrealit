'use client';

type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<SpinnerSize, string> = {
  xs: 'size-4 border',
  sm: 'size-5 border-2',
  md: 'size-8 border-2',
  lg: 'size-12 border-[3px]',
};

type SpinnerProps = {
  size?: SpinnerSize;
  className?: string;
  label?: string;
};

export function AdminLoadingSpinner({ size = 'md', className = '', label }: SpinnerProps) {
  return (
    <div
      className={`inline-flex flex-col items-center justify-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Načítání'}
    >
      <div
        className={`${SIZE[size]} animate-spin rounded-full border-[#e85d00] border-t-transparent`}
        aria-hidden
      />
      {label ? <span className="text-sm text-zinc-600">{label}</span> : null}
    </div>
  );
}

export function ButtonSpinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

type OverlayProps = {
  label?: string;
  progress?: number;
  sublabel?: string;
  visible: boolean;
};

export function AdminLoadingOverlay({ visible, label, progress, sublabel }: OverlayProps) {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={label ?? 'Zpracovávám'}
    >
      <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
        <AdminLoadingSpinner size="lg" />
        <p className="mt-4 text-center text-sm font-semibold text-zinc-900">{label ?? 'Zpracovávám…'}</p>
        {sublabel ? <p className="mt-1 text-center text-xs text-zinc-500">{sublabel}</p> : null}
        {typeof progress === 'number' ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-[#e85d00] transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-zinc-500">{Math.round(progress)} %</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type InlineProps = {
  label?: string;
  className?: string;
};

export function InlineLoadingState({ label = 'Načítám…', className = '' }: InlineProps) {
  return (
    <div className={`flex items-center gap-2 text-sm text-zinc-600 ${className}`} role="status" aria-live="polite">
      <AdminLoadingSpinner size="xs" />
      <span>{label}</span>
    </div>
  );
}

type PageProps = {
  label?: string;
  slow?: boolean;
  onRetry?: () => void;
};

export function PageLoadingState({ label = 'Načítám…', slow, onRetry }: PageProps) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-12">
      <AdminLoadingSpinner size="lg" label={label} />
      {slow ? (
        <div className="text-center">
          <p className="text-sm text-amber-700">Načítání trvá déle než obvykle.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
            >
              Zkusit znovu
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ProgressProps = {
  current: number;
  total: number;
  label?: string;
};

export function ProgressLoadingState({ current, total, label }: ProgressProps) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-700">{label ?? 'Probíhá…'}</span>
        <span className="font-mono text-xs text-zinc-500">
          {current} / {total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-[#e85d00] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
