'use client';

import { useMemo, useState } from 'react';
import {
  META_AD_PLACEMENTS,
  type MetaAdPlacementId,
  type MetaCampaignCreativePayload,
  placementAspectClass,
} from '@/lib/meta-campaign-creative';
import type { MetaCampaignProductItem } from '@/lib/nest-client';

type Props = {
  creativeType: string;
  payload: MetaCampaignCreativePayload;
  selectedProducts: MetaCampaignProductItem[];
  pageName?: string;
  budgetDaily?: number;
  cityLabel?: string;
};

function CtaButton({ label }: { label: string }) {
  return (
    <span className="inline-block rounded bg-[#1877f2] px-3 py-1.5 text-xs font-semibold text-white">
      {label}
    </span>
  );
}

export function MetaCampaignPlacementPreview({
  creativeType,
  payload,
  selectedProducts,
  pageName = 'XXREALIT',
  budgetDaily,
  cityLabel,
}: Props) {
  const [placement, setPlacement] = useState<MetaAdPlacementId>('facebook_feed_mobile');
  const placementMeta = META_AD_PLACEMENTS.find((p) => p.id === placement) ?? META_AD_PLACEMENTS[1];

  const primaryText = payload.primaryText || payload.text || '';
  const headline = payload.headline || '';
  const description = payload.description || '';
  const cta = payload.cta || 'Zjistit více';
  const image = payload.image || payload.gallery?.[0] || selectedProducts[0]?.imageUrl || null;
  const video = payload.video || null;
  const isStories = placement.includes('stories') || placement === 'reels';
  const isCatalog = creativeType === 'catalog_products';
  const product = selectedProducts[0];

  const cardWidth = useMemo(() => Math.min(placementMeta.width, 500), [placementMeta.width]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="lg:w-56 shrink-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Umístění</p>
        <ul className="space-y-1">
          {META_AD_PLACEMENTS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPlacement(p.id)}
                className={`w-full rounded-lg px-2 py-1.5 text-left text-xs ${
                  placement === p.id
                    ? 'bg-[#1877f2] font-semibold text-white'
                    : 'text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
        {budgetDaily != null ? (
          <p className="mt-3 text-xs text-zinc-500">Rozpočet: {budgetDaily} Kč/den</p>
        ) : null}
        {cityLabel ? <p className="text-xs text-zinc-500">Cílení: {cityLabel}</p> : null}
      </div>

      <div className="flex flex-1 justify-center">
        <div
          className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-lg"
          style={{ width: cardWidth, maxWidth: '100%' }}
        >
          <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 text-xs text-zinc-600">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1877f2] text-[10px] font-bold text-white">
              X
            </span>
            <span>
              {payload.author || pageName} · {placementMeta.label}
            </span>
          </div>

          {!isStories && primaryText ? (
            <p className="whitespace-pre-wrap px-3 py-2 text-sm text-zinc-800">{primaryText}</p>
          ) : null}

          {isCatalog && selectedProducts.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto px-2 pb-2">
              {selectedProducts.map((p) => (
                <div key={p.id} className="w-36 shrink-0 overflow-hidden rounded-lg border border-zinc-200">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.title} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-zinc-100 text-xs text-zinc-400">
                      —
                    </div>
                  )}
                  <div className="p-2 text-[10px]">
                    <p className="line-clamp-2 font-semibold">{p.title}</p>
                    <p className="text-zinc-600">
                      {p.price != null ? `${p.price.toLocaleString('cs-CZ')} ${p.currency}` : ''}
                    </p>
                    <p className="text-zinc-500">{p.city}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : video ? (
            <video
              src={video}
              className={`${placementAspectClass(placement)} w-full bg-black object-cover`}
              controls
              muted
              playsInline
            />
          ) : image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className={`${placementAspectClass(placement)} w-full object-cover`}
            />
          ) : (
            <div
              className={`flex ${placementAspectClass(placement)} w-full items-center justify-center bg-zinc-100 text-xs text-zinc-400`}
            >
              Bez média
            </div>
          )}

          {(headline || description || product) && !isCatalog ? (
            <div className="border-t border-zinc-200 px-3 py-2 text-xs">
              <p className="font-semibold text-zinc-500 uppercase tracking-wide">XXREALIT.CZ</p>
              <p className="font-semibold text-zinc-900">{headline || product?.title}</p>
              {description ? <p className="text-zinc-600">{description}</p> : null}
              {product?.price != null ? (
                <p className="text-zinc-800">
                  {product.price.toLocaleString('cs-CZ')} {product.currency}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="border-t border-zinc-200 px-3 py-2">
            <CtaButton label={cta} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetaCampaignPreviewModal({
  open,
  onClose,
  ...props
}: Props & { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900">Náhled reklamy</h3>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 underline">
            Zavřít
          </button>
        </div>
        <MetaCampaignPlacementPreview {...props} />
      </div>
    </div>
  );
}
