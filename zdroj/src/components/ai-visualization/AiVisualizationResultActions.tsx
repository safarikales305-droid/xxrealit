'use client';

type Props = {
  hasEstimate: boolean;
  estimateSummary?: string | null;
  onVariant: () => void;
  onAddPhoto: () => void;
  onShare: () => void;
  onDownload: () => void;
  onEstimate: () => void;
  onContractors: () => void;
  generating?: boolean;
};

export function AiVisualizationResultActions({
  hasEstimate,
  estimateSummary,
  onVariant,
  onAddPhoto,
  onShare,
  onDownload,
  onEstimate,
  onContractors,
  generating,
}: Props) {
  return (
    <div className="mt-6 space-y-3">
      <div className="hidden grid-cols-2 gap-3 md:grid">
        <button
          type="button"
          onClick={onVariant}
          disabled={generating}
          className="rounded-2xl border-2 border-orange-200 bg-white py-3.5 text-sm font-bold text-orange-800 disabled:opacity-50"
        >
          ✨ Jiná varianta
        </button>
        <button
          type="button"
          onClick={onAddPhoto}
          disabled={generating}
          className="rounded-2xl border-2 border-zinc-900 bg-zinc-900 py-3.5 text-sm font-bold text-white disabled:opacity-50"
        >
          📷 Nahrát další fotku
        </button>
        <button
          type="button"
          onClick={onShare}
          className="rounded-2xl border border-zinc-300 bg-white py-3 text-sm font-bold text-zinc-900"
        >
          🔗 Sdílet
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="rounded-2xl border border-zinc-300 bg-white py-3 text-sm font-bold text-zinc-900"
        >
          ↓ Stáhnout
        </button>
      </div>

      <div className="grid gap-2 md:hidden">
        <button
          type="button"
          onClick={onAddPhoto}
          disabled={generating}
          className="w-full rounded-2xl bg-zinc-900 py-4 text-base font-bold text-white disabled:opacity-50"
        >
          📷 Nahrát další fotku
        </button>
        <button
          type="button"
          onClick={onVariant}
          disabled={generating}
          className="w-full rounded-2xl border-2 border-orange-200 bg-white py-3.5 text-sm font-bold text-orange-800 disabled:opacity-50"
        >
          ✨ Jiná varianta
        </button>
        <button
          type="button"
          onClick={onEstimate}
          className="w-full rounded-2xl bg-orange-600 py-4 text-base font-bold text-white"
        >
          💰 Spočítat cenu
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onShare} className="rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold">
            Sdílet
          </button>
          <button type="button" onClick={onDownload} className="rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold">
            Stáhnout
          </button>
        </div>
      </div>

      {hasEstimate && estimateSummary ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-bold text-zinc-900">💰 Odhad rekonstrukce</p>
          <p className="mt-1 text-lg font-bold text-orange-700">{estimateSummary}</p>
          <button
            type="button"
            onClick={onEstimate}
            className="mt-3 w-full rounded-xl border border-orange-300 bg-white py-2.5 text-sm font-bold text-orange-800"
          >
            Zobrazit rozpočet
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEstimate}
          className="hidden w-full rounded-2xl bg-orange-600 py-4 text-base font-bold text-white shadow-md md:block"
        >
          💰 SPOČÍTAT CENU REKONSTRUKCE
        </button>
      )}

      <button
        type="button"
        onClick={onContractors}
        className="hidden w-full rounded-2xl border-2 border-zinc-900 bg-zinc-900 py-4 text-base font-bold text-white md:block"
      >
        🏗️ OSLOVIT STAVEBNÍ FIRMY
      </button>
    </div>
  );
}
