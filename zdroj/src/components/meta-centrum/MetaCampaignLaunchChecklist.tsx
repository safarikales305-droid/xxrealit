'use client';

import type { MetaCampaignValidationItem } from '@/lib/meta-campaign-launch-validation';
import type { MetaCampaignDraftBody } from '@/lib/nest-client';

type Props = {
  items: MetaCampaignValidationItem[];
  readyToPublish: boolean;
  highlightFailures?: boolean;
  showPreviewGroup?: boolean;
  compact?: boolean;
  title?: string;
  submitPayload?: MetaCampaignDraftBody | null;
};

export function MetaCampaignLaunchChecklist({
  items,
  readyToPublish,
  highlightFailures = false,
  showPreviewGroup = false,
  compact = false,
  title = 'Kontrola před spuštěním',
  submitPayload = null,
}: Props) {
  const groups = showPreviewGroup
    ? (['integration', 'campaign', 'creative', 'preview'] as const)
    : (['integration', 'campaign', 'creative'] as const);

  const groupLabels: Record<(typeof groups)[number], string> = {
    integration: 'Integrace Meta',
    campaign: 'Kampaň',
    creative: 'Kreativa',
    preview: 'Stav reklamy',
  };

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        readyToPublish
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`font-medium ${compact ? 'text-xs' : 'text-sm'} text-zinc-900`}>{title}</p>
        {readyToPublish ? (
          <span className="text-xs font-semibold text-emerald-800">✓ Připraveno ke spuštění</span>
        ) : null}
      </div>
      <div className={`mt-2 grid gap-3 ${compact ? 'text-xs' : 'text-sm'} sm:grid-cols-2`}>
        {groups.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (!groupItems.length) return null;
          return (
            <div key={group}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {groupLabels[group]}
              </p>
              <ul className="space-y-0.5">
                {groupItems.map((i) => (
                  <li
                    key={i.key}
                    className={
                      !i.ok && highlightFailures
                        ? 'font-semibold text-red-800'
                        : i.ok
                          ? 'text-emerald-900'
                          : 'text-zinc-700'
                    }
                  >
                    {i.ok ? '✓' : '❌'} {i.label}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {submitPayload ? (
        <details className="mt-3 rounded border border-zinc-200 bg-white px-2 py-1.5">
          <summary className="cursor-pointer text-xs font-medium text-zinc-800">
            Payload připraven
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-zinc-700">
            {JSON.stringify(submitPayload, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export function MetaCampaignValidationErrors({
  blockers,
  title = 'Před spuštěním opravte:',
}: {
  blockers: string[];
  title?: string;
}) {
  if (!blockers.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {blockers.map((b) => (
          <li key={b}>{b.startsWith('❌') ? b : `❌ ${b}`}</li>
        ))}
      </ul>
    </div>
  );
}
