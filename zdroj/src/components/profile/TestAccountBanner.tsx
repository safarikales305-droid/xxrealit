'use client';

type Props = {
  isTestAccount?: boolean;
  showReset?: boolean;
  resetBusy?: boolean;
  onReset?: () => void;
  resetLabel?: string;
};

export function TestAccountBanner({
  isTestAccount,
  showReset,
  resetBusy,
  onReset,
  resetLabel = 'Resetovat testovací účet',
}: Props) {
  if (!isTestAccount) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <span className="text-xs font-bold uppercase tracking-wide text-amber-900">
        TESTOVACÍ ÚČET
      </span>
      {showReset && onReset ? (
        <button
          type="button"
          disabled={resetBusy}
          onClick={onReset}
          className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
        >
          {resetBusy ? 'Resetuji…' : resetLabel}
        </button>
      ) : null}
    </div>
  );
}
