'use client';

import { useState } from 'react';
import {
  nestFetchListingSourceImages,
  nestPrefillListingFromUrl,
  type ListingPrefillFromUrlData,
} from '@/lib/nest-client';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15';

export type SrealityPrefillApplyPayload = {
  data: ListingPrefillFromUrlData;
  sourceUrl: string;
};

type Props = {
  token: string | null;
  onApply: (payload: SrealityPrefillApplyPayload) => void;
  onSourceImagesLoaded?: (files: File[]) => void;
};

function base64ToFile(base64: string, fileName: string, mimeType: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

export function SrealityPrefillSection({ token, onApply, onSourceImagesLoaded }: Props) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [prefillData, setPrefillData] = useState<ListingPrefillFromUrlData | null>(null);

  async function handleLoad() {
    setError(null);
    setSuccess(null);
    const url = sourceUrl.trim();
    if (!url) {
      setError('Zadejte URL inzerátu ze Sreality.');
      return;
    }
    if (!token) {
      setError('Pro načtení údajů se přihlaste.');
      return;
    }

    setLoading(true);
    try {
      const r = await nestPrefillListingFromUrl(token, url, { timeoutMs: 45_000 });
      if (!r.ok) {
        setPrefillData(null);
        setError(r.error);
        return;
      }

      setPrefillData(r.data);
      onApply({ data: r.data, sourceUrl: url });
      setSuccess('Údaje byly předvyplněny. Zkontrolujte je a doplňte fotky.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUseSourceImages() {
    if (!prefillData?.canUseSourceImages || !prefillData.sourceImageUrls.length || !token) {
      setError('Fotky prosím nahrajte vlastní.');
      return;
    }
    setImagesLoading(true);
    setError(null);
    const r = await nestFetchListingSourceImages(token, prefillData.sourceImageUrls);
    setImagesLoading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const files = r.images.map((img) => base64ToFile(img.base64, img.fileName, img.mimeType));
    onSourceImagesLoaded?.(files);
    setSuccess(`Načteno ${files.length} fotek ze zdroje. Zkontrolujte je před uložením.`);
  }

  return (
    <fieldset className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/80 to-white p-6 shadow-sm">
      <legend className="mb-1 text-base font-semibold tracking-tight text-zinc-900">
        Máte inzerát už na Sreality?
      </legend>
      <p className="mb-4 text-sm leading-relaxed text-zinc-600">
        Vložením odkazu se pokusíme předvyplnit popis, lokalitu, typ nemovitosti a parametry. Fotky
        a video nahrajete vlastní.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-1.5 block text-sm font-medium text-zinc-800" htmlFor="srealityUrl">
            URL inzerátu ze Sreality
          </label>
          <input
            id="srealityUrl"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className={inputClass}
            placeholder="https://www.sreality.cz/detail/..."
          />
        </div>
        <button
          type="button"
          onClick={() => void handleLoad()}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-sky-300 bg-white px-5 py-3 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-50 disabled:opacity-60"
        >
          {loading ? 'Načítám…' : 'Načíst údaje'}
        </button>
      </div>

      {success ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          {success}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {prefillData ? (
        <div className="mt-4 space-y-3">
          {prefillData.canUseSourceImages ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p>
                Na Sreality bylo nalezeno {prefillData.sourceImageUrls.length} fotek. Můžete je
                použít, pokud máte k nim práva — jinak nahrajte vlastní.
              </p>
              <button
                type="button"
                onClick={() => void handleUseSourceImages()}
                disabled={imagesLoading}
                className="mt-3 inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                {imagesLoading ? 'Stahuji fotky…' : 'Použít fotky ze zdroje'}
              </button>
            </div>
          ) : (
            <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Fotky prosím nahrajte vlastní.
            </p>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}
