'use client';

import {
  CAMPAIGN_VARIABLE_HINTS,
  type EmailCampaignEditorBlocks,
} from '@/lib/email-campaign-html-builder';

type Props = {
  blocks: EmailCampaignEditorBlocks;
  onChange: (blocks: EmailCampaignEditorBlocks) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  busy?: boolean;
};

export function EmailCampaignBlockEditor({ blocks, onChange, onUploadImage, busy }: Props) {
  function patch(partial: Partial<EmailCampaignEditorBlocks>) {
    onChange({ ...blocks, ...partial });
  }

  async function handleBannerUpload(file: File | null) {
    if (!file) return;
    const url = await onUploadImage(file);
    if (url) patch({ bannerUrl: url });
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-zinc-500">
        Proměnné: {CAMPAIGN_VARIABLE_HINTS.join(', ')}
      </p>

      <label className="block">
        <span className="font-semibold text-zinc-700">Logo URL</span>
        <input
          value={blocks.logoUrl ?? ''}
          onChange={(e) => patch({ logoUrl: e.target.value })}
          className="mt-1 w-full rounded-lg border px-2 py-1.5 text-xs"
          placeholder="https://…"
        />
      </label>

      <div>
        <span className="font-semibold text-zinc-700">Banner / hlavní obrázek</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            value={blocks.bannerUrl ?? ''}
            onChange={(e) => patch({ bannerUrl: e.target.value })}
            className="min-w-[180px] flex-1 rounded-lg border px-2 py-1.5 text-xs"
            placeholder="URL nebo nahrajte soubor"
          />
          <label className="cursor-pointer rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-900">
            Nahrát
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => void handleBannerUpload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>

      <label className="block">
        <span className="font-semibold text-zinc-700">Nadpis</span>
        <input
          value={blocks.headline}
          onChange={(e) => patch({ headline: e.target.value })}
          className="mt-1 w-full rounded-lg border px-2 py-1.5"
        />
      </label>

      <label className="block">
        <span className="font-semibold text-zinc-700">Text (HTML)</span>
        <textarea
          value={blocks.bodyHtml}
          onChange={(e) => patch({ bodyHtml: e.target.value })}
          rows={5}
          className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-xs"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="font-semibold text-zinc-700">Kredit (nabídka)</span>
          <input
            value={blocks.creditAmount ?? ''}
            onChange={(e) => patch({ creditAmount: e.target.value })}
            className="mt-1 w-full rounded-lg border px-2 py-1.5"
            placeholder="{{creditAmount}}"
          />
        </label>
        <label className="block">
          <span className="font-semibold text-zinc-700">Popisek kreditu</span>
          <input
            value={blocks.creditLabel ?? ''}
            onChange={(e) => patch({ creditLabel: e.target.value })}
            className="mt-1 w-full rounded-lg border px-2 py-1.5"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-zinc-700">Tlačítka (CTA)</span>
          <button
            type="button"
            className="text-xs font-semibold text-orange-700"
            onClick={() =>
              patch({
                ctas: [...blocks.ctas, { label: 'Nové tlačítko', url: '{{registrationLink}}' }],
              })
            }
          >
            + Přidat CTA
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {blocks.ctas.map((cta, idx) => (
            <div key={idx} className="rounded-lg border border-zinc-200 p-2">
              <input
                value={cta.label}
                onChange={(e) => {
                  const ctas = [...blocks.ctas];
                  ctas[idx] = { ...cta, label: e.target.value };
                  patch({ ctas });
                }}
                className="mb-1 w-full rounded border px-2 py-1 text-xs"
                placeholder="Text tlačítka"
              />
              <input
                value={cta.url}
                onChange={(e) => {
                  const ctas = [...blocks.ctas];
                  ctas[idx] = { ...cta, url: e.target.value };
                  patch({ ctas });
                }}
                className="w-full rounded border px-2 py-1 text-xs"
                placeholder="{{registrationLink}}"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-zinc-700">Sekce výhod</span>
          <button
            type="button"
            className="text-xs font-semibold text-orange-700"
            onClick={() =>
              patch({
                benefits: [...(blocks.benefits ?? []), { title: 'Výhoda', text: 'Popis výhody' }],
              })
            }
          >
            + Přidat výhodu
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {(blocks.benefits ?? []).map((b, idx) => (
            <div key={idx} className="rounded-lg border border-zinc-200 p-2">
              <input
                value={b.title}
                onChange={(e) => {
                  const benefits = [...(blocks.benefits ?? [])];
                  benefits[idx] = { ...b, title: e.target.value };
                  patch({ benefits });
                }}
                className="mb-1 w-full rounded border px-2 py-1 text-xs"
                placeholder="Nadpis výhody"
              />
              <input
                value={b.text}
                onChange={(e) => {
                  const benefits = [...(blocks.benefits ?? [])];
                  benefits[idx] = { ...b, text: e.target.value };
                  patch({ benefits });
                }}
                className="w-full rounded border px-2 py-1 text-xs"
                placeholder="Text výhody"
              />
            </div>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="font-semibold text-zinc-700">Patička (kontakt)</span>
        <input
          value={blocks.footerContact ?? ''}
          onChange={(e) => patch({ footerContact: e.target.value })}
          className="mt-1 w-full rounded-lg border px-2 py-1.5 text-xs"
        />
      </label>
    </div>
  );
}
