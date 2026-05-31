'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestApiConfigured,
  nestListActiveShortsMusicTracks,
  nestTipCreateMultipart,
  nestTipGenerateShortsFromPhotos,
  type ShortsMusicTrackDto,
  type TiparPostRow,
} from '@/lib/nest-client';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-800';

type Props = {
  onCreated?: (post: TiparPostRow) => void;
  onCancel?: () => void;
};

export function TipCreateForm({ onCreated, onCancel }: Props) {
  const { apiAccessToken } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [propertyPrice, setPropertyPrice] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [ownerNote, setOwnerNote] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactUnlockPrice, setContactUnlockPrice] = useState('100');
  const [isShorts, setIsShorts] = useState(false);

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<
    Array<{ id: string; file: File; previewUrl: string }>
  >([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');

  const [shortsMusicTrackId, setShortsMusicTrackId] = useState('');
  const [shortsMusicTracks, setShortsMusicTracks] = useState<ShortsMusicTrackDto[]>([]);
  const [shortsMusicTracksLoading, setShortsMusicTracksLoading] = useState(false);
  const shortsPreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [shortsTextOverlay, setShortsTextOverlay] = useState(true);
  const [shortsGenerating, setShortsGenerating] = useState(false);
  const [shortsError, setShortsError] = useState<string | null>(null);
  const [shortsSuccess, setShortsSuccess] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nestApiConfigured() || !apiAccessToken) {
      setShortsMusicTracks([]);
      return;
    }
    let cancelled = false;
    setShortsMusicTracksLoading(true);
    void nestListActiveShortsMusicTracks(apiAccessToken).then((rows) => {
      if (!cancelled) {
        setShortsMusicTracks(rows);
        setShortsMusicTracksLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiAccessToken]);

  const onPickImageFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list?.length) return;
      const picked = Array.from(list).filter((f) => f.type.startsWith('image/'));
      if (picked.length === 0) return;
      const merged = [...imageFiles, ...picked].slice(0, 30);
      setImageFiles(merged);
      setImagePreviews((prev) => {
        const next = [...prev];
        for (const file of picked) {
          if (next.length >= 30) break;
          next.push({
            id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            previewUrl: URL.createObjectURL(file),
          });
        }
        return next;
      });
      setError(null);
      e.target.value = '';
    },
    [imageFiles],
  );

  const onPickVideoFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;
      if (!file.type.startsWith('video/')) {
        setError('Vyberte prosím video soubor.');
        return;
      }
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
      setVideoUrl('');
      setShortsSuccess(null);
      setError(null);
      e.target.value = '';
    },
    [videoPreviewUrl],
  );

  const moveImageLeft = useCallback((index: number) => {
    if (index <= 0) return;
    setImageFiles((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    setImagePreviews((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveImageRight = useCallback((index: number) => {
    setImageFiles((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    setImagePreviews((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const setAsMainImage = useCallback((index: number) => {
    if (index <= 0) return;
    setImageFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
    setImagePreviews((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  }, []);

  const removeImage = useCallback((index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const generateShortsFromPhotos = useCallback(async () => {
    setShortsError(null);
    setShortsSuccess(null);
    if (!nestApiConfigured() || !apiAccessToken) {
      setShortsError('Přihlaste se a nastavte NEXT_PUBLIC_API_URL.');
      return;
    }
    if (imagePreviews.length < 2) {
      setShortsError('Přidejte alespoň dvě fotky.');
      return;
    }
    if (shortsTextOverlay) {
      const t = title.trim();
      const c = city.trim();
      const priceNum = Math.round(Number(propertyPrice));
      if (!t || !c || !Number.isFinite(priceNum) || priceNum < 0) {
        setShortsError('Pro text ve videu vyplňte název, lokalitu a cenu.');
        return;
      }
    }

    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('city', city.trim());
    fd.append('price', String(Math.round(Number(propertyPrice)) || 0));
    fd.append('currency', 'CZK');
    if (shortsMusicTrackId.trim()) {
      fd.append('musicTrackId', shortsMusicTrackId.trim());
      fd.append('musicKey', 'none');
    } else {
      fd.append('musicKey', 'none');
    }
    fd.append('includeTextOverlay', String(shortsTextOverlay));
    for (const img of imagePreviews) {
      fd.append('images', img.file);
    }

    setShortsGenerating(true);
    const r = await nestTipGenerateShortsFromPhotos(apiAccessToken, fd);
    setShortsGenerating(false);
    if (!r.ok) {
      setShortsError(r.error ?? 'Generování selhalo.');
      return;
    }
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoUrl(r.videoUrl);
    setIsShorts(true);
    setShortsSuccess('Shorts video je hotové. Po publikování se tip zobrazí ve Shorts feedu.');
  }, [
    apiAccessToken,
    city,
    imagePreviews,
    propertyPrice,
    shortsMusicTrackId,
    shortsTextOverlay,
    title,
    videoPreviewUrl,
  ]);

  function resetMedia() {
    for (const p of imagePreviews) {
      URL.revokeObjectURL(p.previewUrl);
    }
    setImagePreviews([]);
    setImageFiles([]);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
    setVideoFile(null);
    setVideoUrl('');
    setShortsSuccess(null);
    setShortsError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nestApiConfigured() || !apiAccessToken) {
      setError('Přihlaste se pro vytvoření tipu.');
      return;
    }

    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      setError('Vyplňte název a popis tipu.');
      return;
    }

    const hasVideo = Boolean(videoFile || videoUrl.trim());
    if (isShorts && !hasVideo) {
      setError('Shorts tip vyžaduje nahrané nebo vygenerované video.');
      return;
    }
    if (!isShorts && imagePreviews.length === 0) {
      setError('Přidejte alespoň jednu fotku.');
      return;
    }

    const fd = new FormData();
    fd.append('title', t);
    fd.append('description', d);
    fd.append('city', city.trim());
    if (propertyPrice.trim()) fd.append('propertyPrice', propertyPrice.trim());
    if (sourceUrl.trim()) fd.append('sourceUrl', sourceUrl.trim());
    if (ownerNote.trim()) fd.append('ownerNote', ownerNote.trim());
    fd.append('contactName', contactName.trim());
    fd.append('contactPhone', contactPhone.trim());
    fd.append('contactEmail', contactEmail.trim());
    fd.append('contactUnlockPrice', contactUnlockPrice.trim() || '100');
    fd.append('isShorts', String(isShorts));
    if (videoUrl.trim()) fd.append('videoUrl', videoUrl.trim());
    if (videoFile) fd.append('video', videoFile);

    imagePreviews.forEach((img, index) => {
      fd.append('images', img.file);
      fd.append('imageOrder', String(index + 1));
    });

    setSubmitting(true);
    const r = await nestTipCreateMultipart(apiAccessToken, fd);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení tipu selhalo.');
      return;
    }

    resetMedia();
    setTitle('');
    setDescription('');
    setCity('');
    setPropertyPrice('');
    setSourceUrl('');
    setOwnerNote('');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setContactUnlockPrice('100');
    setIsShorts(false);
    if (r.data) onCreated?.(r.data);
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mx-auto w-full max-w-2xl space-y-6 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6"
    >
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <div>
          <label className={labelClass} htmlFor="tip-title">
            Název tipu *
          </label>
          <input
            id="tip-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Zajímavý byt v centru…"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="tip-desc">
            Popis nemovitosti *
          </label>
          <textarea
            id="tip-desc"
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} resize-y`}
            placeholder="Proč je nemovitost zajímavá…"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="tip-city">
              Lokalita
            </label>
            <input
              id="tip-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
              placeholder="Praha 5"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tip-price">
              Cena nemovitosti (Kč)
            </label>
            <input
              id="tip-price"
              type="number"
              min={0}
              value={propertyPrice}
              onChange={(e) => setPropertyPrice(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Fotky a video</legend>

        <div>
          <p className="mb-2 text-xs text-zinc-600">
            Nahrát fotky (min. 1, max 30). První fotka = hlavní náhled.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/*"
            multiple
            capture="environment"
            onChange={onPickImageFiles}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#e85d00] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
        </div>

        {imagePreviews.length > 0 ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {imagePreviews.map((img, index) => (
              <div key={img.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.previewUrl} alt="" className="h-28 w-full object-cover sm:h-32" />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {index === 0 ? 'Hlavní' : index + 1}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1 p-1.5">
                  <button type="button" onClick={() => moveImageLeft(index)} className="rounded border px-1.5 py-0.5 text-[10px]">
                    ←
                  </button>
                  <button type="button" onClick={() => moveImageRight(index)} className="rounded border px-1.5 py-0.5 text-[10px]">
                    →
                  </button>
                  {index > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAsMainImage(index)}
                      className="rounded border border-[#e85d00]/40 px-1.5 py-0.5 text-[10px] text-[#e85d00]"
                    >
                      Hlavní
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="ml-auto rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600"
                  >
                    Smazat
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Zatím žádné fotky.</p>
        )}

        <div>
          <p className="mb-2 text-xs text-zinc-600">Nahrát video (volitelné, max 1)</p>
          <input
            type="file"
            accept="video/*"
            capture="environment"
            onChange={onPickVideoFile}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
        </div>

        {videoPreviewUrl ? (
          <video src={videoPreviewUrl} controls playsInline className="w-full rounded-xl bg-black" />
        ) : null}
        {videoUrl && !videoPreviewUrl ? (
          <video src={videoUrl} controls playsInline className="w-full rounded-xl bg-black" />
        ) : null}

        {imagePreviews.length >= 2 ? (
          <div className="rounded-xl border border-[#e85d00]/30 bg-orange-50/60 p-3">
            <p className="text-sm font-semibold text-zinc-900">Vytvořit Shorts video z fotek</p>
            <p className="mt-1 text-xs text-zinc-600">
              Vertikální video 9:16 s přechody a volitelnou hudbou z knihovny.
            </p>
            <div className="mt-3">
              <label className={labelClass} htmlFor="tip-shorts-music">
                Hudba
              </label>
              <select
                id="tip-shorts-music"
                value={shortsMusicTrackId}
                onChange={(e) => setShortsMusicTrackId(e.target.value)}
                disabled={shortsGenerating || shortsMusicTracksLoading}
                className={inputClass}
              >
                <option value="">Bez hudby</option>
                {shortsMusicTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!shortsMusicTrackId || shortsGenerating}
                onClick={() => {
                  const t = shortsMusicTracks.find((x) => x.id === shortsMusicTrackId);
                  const el = shortsPreviewAudioRef.current;
                  if (!t?.fileUrl || !el) return;
                  el.src = t.fileUrl;
                  void el.play().catch(() => undefined);
                }}
                className="mt-2 rounded-lg border bg-white px-3 py-1 text-xs font-semibold"
              >
                Přehrát ukázku
              </button>
              <audio ref={shortsPreviewAudioRef} className="hidden" />
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={shortsTextOverlay}
                onChange={(e) => setShortsTextOverlay(e.target.checked)}
              />
              Text s názvem, lokalitou a cenou
            </label>
            {shortsError ? <p className="mt-2 text-xs text-red-600">{shortsError}</p> : null}
            {shortsSuccess ? <p className="mt-2 text-xs text-emerald-700">{shortsSuccess}</p> : null}
            <button
              type="button"
              disabled={shortsGenerating}
              onClick={() => void generateShortsFromPhotos()}
              className="mt-3 rounded-full bg-[#e85d00] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {shortsGenerating ? 'Generuji video…' : 'Vygenerovat Shorts video'}
            </button>
          </div>
        ) : null}
      </fieldset>

      <div className="space-y-3">
        <input
          placeholder="Odkaz na zdroj (volitelné)"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className={inputClass}
        />
        <textarea
          placeholder="Vlastní poznámka (volitelné)"
          rows={2}
          value={ownerNote}
          onChange={(e) => setOwnerNote(e.target.value)}
          className={inputClass}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            placeholder="Kontakt — jméno"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Telefon"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="E-mail"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <input
          placeholder="Cena za odemčení kontaktu (Kč)"
          type="number"
          min={0}
          value={contactUnlockPrice}
          onChange={(e) => setContactUnlockPrice(e.target.value)}
          className={inputClass}
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={isShorts}
            onChange={(e) => setIsShorts(e.target.checked)}
            className="mt-1"
          />
          <span>
            <strong>Zobrazit jako Shorts tip na nemovitost</strong>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Ve Shorts feedu; kontakt zůstane zamčený za kredit. Vyžaduje video nebo vygenerované
              video z fotek.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-[#e85d00] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Publikuji…' : 'Publikovat tip'}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700"
          >
            Zavřít
          </button>
        ) : null}
      </div>
    </form>
  );
}
