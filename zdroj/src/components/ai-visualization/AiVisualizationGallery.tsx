'use client';

import {
  buildGalleryCards,
  type AiVisualizationConfig,
  type AiVisualizationView,
  type GalleryCard,
} from '@/lib/ai-visualization-client';

type Props = {
  items: AiVisualizationView[];
  activeId: string | null;
  config: AiVisualizationConfig | null;
  onSelect: (viz: AiVisualizationView) => void;
  onCompare: (viz: AiVisualizationView) => void;
  onVariant: (viz: AiVisualizationView) => void;
  onShare: (viz: AiVisualizationView) => void;
  onDownload: (viz: AiVisualizationView) => void;
  onDelete: (viz: AiVisualizationView) => void;
};

function labelFor(viz: AiVisualizationView, config: AiVisualizationConfig | null): string {
  const found = config?.propertyTypes?.find((p) => p.id === viz.propertyType);
  return found ? `${found.emoji} ${found.label}` : viz.propertyType ?? 'Vizualizace';
}

export function AiVisualizationGallery({
  items,
  activeId,
  config,
  onSelect,
  onCompare,
  onVariant,
  onShare,
  onDownload,
  onDelete,
}: Props) {
  const cards = buildGalleryCards(items);
  if (cards.length <= 1) return null;

  const photoCount = cards.length;
  const variantCount = items.length;

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-zinc-900">Moje rekonstrukce</h2>
        <p className="text-xs text-zinc-600">
          {photoCount} {photoCount === 1 ? 'fotografie' : 'fotografie'} · {variantCount} AI variant
        </p>
      </div>
      <p className="mt-1 text-xs font-semibold text-zinc-500">Moje vizualizace</p>
      <ul className="mt-4 space-y-4">
        {cards.map((card: GalleryCard) => {
          const { display } = card;
          const active = display.id === activeId;
          const title = labelFor(display, config);
          return (
            <li
              key={card.rootId}
              className={`rounded-xl border p-3 ${active ? 'border-orange-400 bg-orange-50/50' : 'border-zinc-200'}`}
            >
              <button type="button" onClick={() => onSelect(display)} className="w-full text-left">
                <p className="text-sm font-bold text-zinc-900">{title}</p>
                <p className="text-[11px] text-zinc-500">
                  {new Date(display.createdAt).toLocaleDateString('cs-CZ')}
                  {card.variantCount > 1 ? ` · ${card.variantCount} variant` : ''}
                </p>
                <div className="mt-2 flex gap-2">
                  {display.originalPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={display.originalPreviewUrl} alt="Před" className="h-16 w-14 rounded-lg object-cover" />
                  ) : null}
                  {display.resultPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={display.resultPreviewUrl} alt="Po" className="h-16 w-14 rounded-lg object-cover" />
                  ) : null}
                  <span className="self-center text-[10px] text-zinc-500">Před | Po</span>
                </div>
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionChip label="Porovnat" onClick={() => onCompare(display)} />
                <ActionChip label="✨ Jiná varianta" onClick={() => onVariant(display)} />
                <ActionChip label="Sdílet" onClick={() => onShare(display)} />
                <ActionChip label="Stáhnout" onClick={() => onDownload(display)} />
                <ActionChip label="Odstranit" onClick={() => onDelete(display)} danger />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ActionChip({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        danger ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-800'
      }`}
    >
      {label}
    </button>
  );
}
