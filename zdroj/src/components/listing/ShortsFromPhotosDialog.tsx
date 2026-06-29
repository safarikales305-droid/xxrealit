'use client';

import { useEffect, useState } from 'react';
import { nestGeneratePropertyShortsFromPhotos, nestTipGenerateShortsFromPhotos } from '@/lib/nest-client';
import {
  appendOverlayToFormData,
  createDefaultOverlaySettings,
  type ShortsOverlaySettings,
} from '@/lib/shorts-overlay';
import { ShortsOverlayPreview } from '@/components/listing/ShortsOverlayPreview';
import { ShortsOverlaySettingsPanel } from '@/components/listing/ShortsOverlaySettingsPanel';
import type { ShortsMusicTrackDto } from '@/lib/nest-client';

type Props = {
  open: boolean;
  onClose: () => void;
  token: string | null;
  imageFiles: File[];
  previewUrl: string | null;
  offerType: string;
  isTip?: boolean;
  musicTrackId: string;
  musicTracks: ShortsMusicTrackDto[];
  title: string;
  city: string;
  currency: string;
  initialSettings?: Partial<ShortsOverlaySettings>;
  apiMode?: 'property' | 'tip';
  onSuccess: (videoUrl: string, settings: ShortsOverlaySettings) => void;
};

export function ShortsFromPhotosDialog({
  open,
  onClose,
  token,
  imageFiles,
  previewUrl,
  offerType,
  isTip,
  musicTrackId,
  title,
  city,
  currency,
  initialSettings,
  apiMode = 'property',
  onSuccess,
}: Props) {
  const [settings, setSettings] = useState<ShortsOverlaySettings>(() =>
    createDefaultOverlaySettings({ offerType, isTip }),
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSettings({
      ...createDefaultOverlaySettings({ offerType, isTip }),
      ...initialSettings,
    });
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset jen při otevření dialogu
  }, [open, offerType, isTip]);

  if (!open) return null;

  async function handleGenerate() {
    if (!token || imageFiles.length < 2) {
      setError('Přidejte alespoň dvě fotky.');
      return;
    }
    setGenerating(true);
    setError(null);
    const fd = new FormData();
    fd.append('title', title.trim() || settings.overlayText);
    fd.append('city', city.trim() || '—');
    fd.append('price', '0');
    fd.append('currency', currency.trim() || 'CZK');
    fd.append('offerType', offerType);
    fd.append('type', offerType);
    if (musicTrackId.trim()) {
      fd.append('musicTrackId', musicTrackId.trim());
      fd.append('musicKey', 'none');
    } else {
      fd.append('musicKey', 'none');
    }
    appendOverlayToFormData(fd, settings);
    if (isTip) {
      fd.append('isTip', 'true');
    }
    for (const file of imageFiles) {
      fd.append('images', file);
    }
    const generate =
      apiMode === 'tip' ? nestTipGenerateShortsFromPhotos : nestGeneratePropertyShortsFromPhotos;
    const r = await generate(token, fd);
    setGenerating(false);
    if (!r.ok) {
      setError(r.error ?? 'Generování selhalo.');
      return;
    }
    onSuccess(r.videoUrl, settings);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl"
      >
        <div className="border-b border-zinc-100 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold text-zinc-900">Vytvořit Shorts video z fotek</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Nastavte horní logo a nápis. Náhled se aktualizuje okamžitě.
          </p>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">
          <ShortsOverlayPreview previewImageUrl={previewUrl} settings={settings} />
          <ShortsOverlaySettingsPanel
            settings={settings}
            onChange={setSettings}
            disabled={generating}
          />
        </div>

        {error ? (
          <p className="mx-5 mb-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 sm:mx-6">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || imageFiles.length < 2}
            className="rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {generating ? 'Generuji video…' : 'Vygenerovat video'}
          </button>
        </div>
      </div>
    </div>
  );
}
