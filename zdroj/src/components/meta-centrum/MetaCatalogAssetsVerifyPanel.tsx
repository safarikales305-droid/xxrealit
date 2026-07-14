'use client';

import type { MetaCatalogSalesAssetsVerification } from '@/lib/nest-client';

type Props = {
  verification: MetaCatalogSalesAssetsVerification | null;
  busy?: boolean;
  onRun?: () => void;
  compact?: boolean;
};

export function MetaCatalogAssetsVerifyPanel({ verification, busy, onRun, compact }: Props) {
  if (!verification && !onRun) return null;

  return (
    <div
      className={`space-y-3 rounded-lg border px-3 py-2 text-xs ${
        verification?.ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
          : verification
            ? 'border-red-200 bg-red-50 text-red-950'
            : 'border-zinc-200 bg-zinc-50 text-zinc-900'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-sm">Ověření Meta assetů (Catalog Sales)</p>
        {onRun ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRun}
            className="rounded-lg border border-[#1877f2] bg-white px-2 py-1 text-xs font-medium text-[#1877f2] hover:bg-blue-50 disabled:opacity-50"
          >
            {busy ? 'Ověřuji…' : 'Ověřit assety'}
          </button>
        ) : null}
      </div>

      {verification ? (
        <>
          <p className="whitespace-pre-wrap">{verification.message}</p>
          {verification.promotedObjectPixelId ? (
            <p className="font-mono text-[10px]">
              promoted_object.pixel_id: {verification.promotedObjectPixelId}
              {verification.configuredPixelId
                ? ` · nastavený Pixel: ${verification.configuredPixelId}`
                : ' · pixelId v nastavení: null'}
              {verification.configuredDatasetId
                ? ` · Dataset: ${verification.configuredDatasetId}`
                : ''}
            </p>
          ) : null}

          {!compact && verification.assets ? (
            <ul className="grid gap-0.5 font-mono text-[10px] sm:grid-cols-2">
              {Object.entries(verification.assets).map(([key, asset]) => (
                <li key={key}>
                  {key}: {asset?.id ?? '—'}
                  {asset?.name ? ` (${asset.name})` : ''}
                </li>
              ))}
            </ul>
          ) : null}

          {verification.checks?.length ? (
            <ul className="space-y-1">
              {verification.checks.map((check) => (
                <li
                  key={check.key}
                  className={`rounded border px-2 py-1 ${
                    check.ok ? 'border-emerald-100 bg-white/80' : 'border-red-200 bg-white'
                  }`}
                >
                  <p>{check.message}</p>
                  {!compact ? (
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{check.graphUrl}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="text-zinc-600">
          Ověří Business, Ad Account, Catalog, Dataset, Pixel, Page a Instagram včetně vazeb před Create Ad Set.
        </p>
      )}
    </div>
  );
}
