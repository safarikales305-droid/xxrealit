'use client';

import type { MetaCampaignDraft, MetaLaunchPayloadSnapshot, MetaLaunchSteps } from '@/lib/nest-client';
import type { MetaCampaignProductItem } from '@/lib/nest-client';

const STEP_LABELS: Record<keyof MetaLaunchSteps, string> = {
  campaign: 'Campaign',
  adSet: 'Ad Set',
  creative: 'Creative',
  ad: 'Ad',
};

function stepStatusLabel(steps: MetaLaunchSteps | null | undefined, key: keyof MetaLaunchSteps): string {
  const state = steps?.[key];
  if (!state) return '○ Nevytvořeno';
  if (state.ok) return `✓ Vytvořeno${state.id ? ` (${state.id})` : ''}`;
  return `✗ Chyba${state.error ? `: ${state.error.split('\n')[0]}` : ''}`;
}

type Props = {
  campaign: MetaCampaignDraft;
  products?: MetaCampaignProductItem[];
};

export function MetaCampaignDetailPanel({ campaign, products = [] }: Props) {
  const cp = (campaign.creativePayload ?? {}) as Record<string, unknown>;
  const payloads = campaign.metaLaunchPayloads as MetaLaunchPayloadSnapshot | null | undefined;
  const selectedProducts = products.filter((p) => campaign.selectedProductIds.includes(p.id));
  const primaryText = String(cp.primaryText ?? cp.text ?? '—');
  const headline = String(cp.headline ?? '—');
  const description = String(cp.description ?? '—');
  const cta = String(cp.cta ?? cp.ctaType ?? '—');
  const url = String(cp.link ?? cp.detailUrl ?? '—');

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
      <p className="font-semibold text-sm">Detail reklamy</p>

      <div>
        <p className="mb-1 font-medium">Stav kroků v Meta</p>
        <ul className="space-y-0.5 font-mono">
          {(Object.keys(STEP_LABELS) as Array<keyof MetaLaunchSteps>).map((key) => (
            <li key={key}>
              {STEP_LABELS[key]}: {stepStatusLabel(campaign.metaLaunchSteps, key)}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <p>
          <span className="font-medium">Campaign ID:</span>{' '}
          <span className="font-mono">{campaign.metaCampaignId ?? '—'}</span>
        </p>
        <p>
          <span className="font-medium">Ad Set ID:</span>{' '}
          <span className="font-mono">{campaign.metaAdSetId ?? '—'}</span>
        </p>
        <p>
          <span className="font-medium">Creative ID:</span>{' '}
          <span className="font-mono">{campaign.metaCreativeId ?? '—'}</span>
        </p>
        <p>
          <span className="font-medium">Ad ID:</span>{' '}
          <span className="font-mono">{campaign.metaAdId ?? '—'}</span>
        </p>
      </div>

      <div>
        <p className="mb-1 font-medium">Text reklamy</p>
        <ul className="space-y-0.5">
          <li>Primary text: {primaryText}</li>
          <li>Headline: {headline}</li>
          <li>Description: {description}</li>
          <li>CTA: {cta}</li>
          <li>URL: {url}</li>
        </ul>
      </div>

      {selectedProducts.length > 0 ? (
        <div>
          <p className="mb-1 font-medium">Vybrané produkty ({selectedProducts.length})</p>
          <ul className="list-inside list-disc">
            {selectedProducts.map((p) => (
              <li key={p.id}>
                {p.title}
                {p.city ? ` · ${p.city}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="mb-1 font-medium">Cílení lokality</p>
        <p>
          Režim:{' '}
          {campaign.locationTargetingMode === 'radius'
            ? 'Okruh podle souřadnic'
            : 'Celé město'}
          {campaign.cityName ? ` · ${campaign.cityName}` : ''}
          {campaign.metaGeoKey ? ` · Geo ID ${campaign.metaGeoKey}` : ''}
          {campaign.radiusKm != null ? ` · ${campaign.radiusKm} km` : ''}
        </p>
      </div>

      {payloads?.targeting ? (
        <details>
          <summary className="cursor-pointer font-medium">Targeting payload</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[10px]">
            {JSON.stringify(payloads.targeting, null, 2)}
          </pre>
        </details>
      ) : null}
      {payloads?.adSet ? (
        <details>
          <summary className="cursor-pointer font-medium">Ad Set payload</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[10px]">
            {JSON.stringify(payloads.adSet, null, 2)}
          </pre>
        </details>
      ) : null}
      {payloads?.creative ? (
        <details>
          <summary className="cursor-pointer font-medium">Creative payload</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[10px]">
            {JSON.stringify(payloads.creative, null, 2)}
          </pre>
        </details>
      ) : null}
      {payloads?.ad ? (
        <details>
          <summary className="cursor-pointer font-medium">Ad payload</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[10px]">
            {JSON.stringify(payloads.ad, null, 2)}
          </pre>
        </details>
      ) : null}

      {campaign.errorMessage ? (
        <p className="whitespace-pre-wrap text-red-800">{campaign.errorMessage}</p>
      ) : null}
    </div>
  );
}
