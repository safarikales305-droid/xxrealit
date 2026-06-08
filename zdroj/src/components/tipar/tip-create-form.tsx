'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ShortsVideoFrame } from '@/components/tipar/shorts-video-frame';
import { isValidTiparPhone, normalizeTiparPhone } from '@/lib/tipar-phone';
import {
  nestApiConfigured,
  nestListActiveShortsMusicTracks,
  nestTipCreateMultipart,
  nestTipGenerateShortsFromPhotos,
  nestTipUpdateMultipart,
  type ShortsMusicTrackDto,
  type TiparPostRow,
} from '@/lib/nest-client';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-800';

type ImageItem = {
  id: string;
  previewUrl: string;
  file?: File;
  existingUrl?: string;
};

type Props = {
  editTip?: TiparPostRow | null;
  focusShorts?: boolean;
  onSaved?: (post: TiparPostRow) => void;
  onCancel?: () => void;
};

export function TipCreateForm({ editTip, focusShorts = false, onSaved, onCancel }: Props) {
  const { apiAccessToken, refresh } = useAuth();
  const isEdit = Boolean(editTip?.id);
  const shortsSectionRef = useRef<HTMLDivElement | null>(null);

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

  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState('');
  const [generatedPreviewUrl, setGeneratedPreviewUrl] = useState<string | null>(null);
  const [isGeneratedVideoUsed, setIsGeneratedVideoUsed] = useState(false);

  const [shortsMusicTrackId, setShortsMusicTrackId] = useState('');
  const [shortsMusicTracks, setShortsMusicTracks] = useState<ShortsMusicTrackDto[]>([]);
  const [shortsMusicTracksLoading, setShortsMusicTracksLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const [shortsTextOverlay, setShortsTextOverlay] = useState(true);
  const [shortsGenerating, setShortsGenerating] = useState(false);
  const [shortsError, setShortsError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const stopMusic = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlayingMusicId(null);
  }, []);

  const playMusic = useCallback(
    (track: ShortsMusicTrackDto) => {
      const el = audioRef.current;
      if (!el || !track.fileUrl) return;
      stopMusic();
      el.src = track.fileUrl;
      void el.play()
        .then(() => setPlayingMusicId(track.id))
        .catch(() => setPlayingMusicId(null));
    },
    [stopMusic],
  );

  const toggleMusic = useCallback(
    (track: ShortsMusicTrackDto) => {
      if (playingMusicId === track.id) {
        stopMusic();
        return;
      }
      playMusic(track);
    },
    [playMusic, playingMusicId, stopMusic],
  );

  useEffect(() => {
    return () => {
      stopMusic();
      for (const item of imageItems) {
        if (item.file && item.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
      if (videoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(videoPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editTip) return;
    setTitle(editTip.title);
    setDescription(editTip.description);
    setCity(editTip.city);
    setPropertyPrice(editTip.propertyPrice != null ? String(editTip.propertyPrice) : '');
    setSourceUrl(editTip.sourceUrl ?? '');
    setOwnerNote(editTip.ownerNote ?? '');
    setContactName(editTip.contact?.contactName ?? '');
    setContactPhone(editTip.contact?.contactPhone ?? '');
    setContactEmail(editTip.contact?.contactEmail ?? '');
    setContactUnlockPrice(String(editTip.contactUnlockPrice ?? 100));
    setIsShorts(editTip.isShorts);
    setVideoUrl(editTip.videoUrl ?? '');
    const existingGenerated = editTip.generatedVideoUrl ?? '';
    setGeneratedVideoUrl(existingGenerated);
    setGeneratedPreviewUrl(null);
    setIsGeneratedVideoUsed(Boolean(editTip.videoUrl && existingGenerated));
    setShortsMusicTrackId(editTip.selectedMusicId ?? '');
    setImageItems(
      (editTip.images ?? []).map((url) => ({
        id: `existing-${url}`,
        previewUrl: url,
        existingUrl: url,
      })),
    );
  }, [editTip]);

  useEffect(() => {
    if (focusShorts && shortsSectionRef.current) {
      shortsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsShorts(true);
    }
  }, [focusShorts, editTip?.id]);

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

  const onPickImageFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) return;
    setImageItems((prev) => {
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
  }, []);

  const onPickVideoFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;
      if (!file.type.startsWith('video/')) {
        setError('Vyberte prosím video soubor.');
        return;
      }
      if (videoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(videoPreviewUrl);
      setVideoFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
      setVideoUrl('');
      setGeneratedVideoUrl('');
      setGeneratedPreviewUrl(null);
      setIsGeneratedVideoUsed(false);
      setError(null);
      e.target.value = '';
    },
    [videoPreviewUrl],
  );

  const moveImage = useCallback((index: number, dir: -1 | 1) => {
    setImageItems((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const setAsMainImage = useCallback((index: number) => {
    if (index <= 0) return;
    setImageItems((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  }, []);

  const removeImage = useCallback((index: number) => {
    setImageItems((prev) => {
      const target = prev[index];
      if (target?.file && target.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const collectImageFilesForShorts = useCallback(async (): Promise<File[]> => {
    const files: File[] = [];
    for (const item of imageItems) {
      if (item.file) {
        files.push(item.file);
      } else if (item.existingUrl) {
        const res = await fetch(item.existingUrl);
        const blob = await res.blob();
        files.push(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
      }
    }
    return files;
  }, [imageItems]);

  const generateShortsFromPhotos = useCallback(async () => {
    setShortsError(null);
    stopMusic();
    if (!nestApiConfigured() || !apiAccessToken) {
      setShortsError('Přihlaste se a nastavte NEXT_PUBLIC_API_URL.');
      return;
    }
    if (imageItems.length < 2) {
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
    }
    fd.append('musicKey', 'none');
    fd.append('includeTextOverlay', String(shortsTextOverlay));

    const imageFiles = await collectImageFilesForShorts();
    for (const f of imageFiles) {
      fd.append('images', f);
    }

    setShortsGenerating(true);
    const r = await nestTipGenerateShortsFromPhotos(apiAccessToken, fd);
    setShortsGenerating(false);
    if (!r.ok) {
      setShortsError(r.error ?? 'Generování selhalo.');
      return;
    }
    if (videoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setGeneratedVideoUrl(r.videoUrl);
    setGeneratedPreviewUrl(r.videoUrl);
    setIsGeneratedVideoUsed(false);
    setIsShorts(true);
  }, [
    apiAccessToken,
    city,
    collectImageFilesForShorts,
    imageItems.length,
    propertyPrice,
    shortsMusicTrackId,
    shortsTextOverlay,
    stopMusic,
    title,
    videoPreviewUrl,
  ]);

  function useGeneratedVideo() {
    const url = (generatedPreviewUrl || generatedVideoUrl).trim();
    if (!url) return;
    setGeneratedVideoUrl(url);
    setVideoUrl(url);
    setIsGeneratedVideoUsed(true);
    setIsShorts(true);
    setGeneratedPreviewUrl(null);
    setError(null);
    setShortsError(null);
  }

  function formDataToDebugPayload(fd: FormData): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of fd.entries()) {
      if (value instanceof File) {
        const prev = out[key];
        const label = `[File ${value.name} ${value.size}b]`;
        out[key] = prev ? (Array.isArray(prev) ? [...prev, label] : [prev, label]) : label;
      } else {
        const prev = out[key];
        out[key] = prev ? (Array.isArray(prev) ? [...prev, value] : [prev, value]) : value;
      }
    }
    return out;
  }

  function resetFormState() {
    stopMusic();
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
    setImageItems([]);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoUrl('');
    setGeneratedVideoUrl('');
    setGeneratedPreviewUrl(null);
    setIsGeneratedVideoUsed(false);
    setShortsMusicTrackId('');
    setShortsError(null);
    setError(null);
    setSuccessMessage(null);
  }

  function buildFormData(opts: {
    resolvedVideoUrl: string;
    resolvedGeneratedVideoUrl: string;
    effectiveIsShorts: boolean;
    markGeneratedVideo: boolean;
  }): FormData {
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('description', description.trim());
    fd.append('city', city.trim());
    fd.append('propertyPrice', propertyPrice.trim() || '0');
    if (sourceUrl.trim()) fd.append('sourceUrl', sourceUrl.trim());
    if (ownerNote.trim()) fd.append('ownerNote', ownerNote.trim());
    fd.append('contactName', contactName.trim());
    fd.append('contactPhone', normalizeTiparPhone(contactPhone));
    fd.append('contactEmail', contactEmail.trim());
    fd.append('contactUnlockPrice', contactUnlockPrice.trim() || '100');
    fd.append('isShorts', String(opts.effectiveIsShorts));
    if (shortsMusicTrackId.trim()) fd.append('musicTrackId', shortsMusicTrackId.trim());
    if (opts.resolvedVideoUrl) {
      fd.append('videoUrl', opts.resolvedVideoUrl);
    }
    if (opts.resolvedGeneratedVideoUrl) {
      fd.append('generatedVideoUrl', opts.resolvedGeneratedVideoUrl);
    }
    if (opts.markGeneratedVideo) {
      fd.append('isGeneratedVideo', 'true');
    }
    if (videoFile) fd.append('video', videoFile);

    const slots = imageItems.map((img) =>
      img.existingUrl ? `existing:${img.existingUrl}` : `new:${img.id}`,
    );
    if (isEdit) {
      fd.append('imageSlots', JSON.stringify(slots));
    }
    imageItems.forEach((img, index) => {
      if (img.file) {
        fd.append('images', img.file);
        fd.append('imageOrder', String(index + 1));
      }
    });
    return fd;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    stopMusic();

    if (!nestApiConfigured() || !apiAccessToken) {
      setError('Přihlaste se pro uložení tipu.');
      return;
    }

    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      setError('Vyplňte název a popis tipu.');
      return;
    }
    if (!isValidTiparPhone(contactPhone)) {
      setError('Telefonní kontakt je povinný.');
      return;
    }

    const resolvedGeneratedVideoUrl = (
      generatedVideoUrl.trim() ||
      generatedPreviewUrl ||
      (isGeneratedVideoUsed ? videoUrl.trim() : '')
    ).trim();
    const resolvedVideoUrl = videoFile
      ? ''
      : (videoUrl.trim() || generatedPreviewUrl || generatedVideoUrl.trim());
    const effectiveIsShorts =
      isShorts ||
      isGeneratedVideoUsed ||
      Boolean(!videoFile && (resolvedVideoUrl || resolvedGeneratedVideoUrl));

    if (effectiveIsShorts && !videoFile && !resolvedVideoUrl && !resolvedGeneratedVideoUrl) {
      setError('Shorts tip vyžaduje nahrané nebo vygenerované video.');
      return;
    }
    if (!effectiveIsShorts && imageItems.length === 0) {
      setError('Přidejte alespoň jednu fotku.');
      return;
    }

    const markGeneratedVideo = Boolean(
      resolvedGeneratedVideoUrl &&
        (isGeneratedVideoUsed || resolvedGeneratedVideoUrl === resolvedVideoUrl),
    );
    const fd = buildFormData({
      resolvedVideoUrl: resolvedVideoUrl || resolvedGeneratedVideoUrl,
      resolvedGeneratedVideoUrl,
      effectiveIsShorts,
      markGeneratedVideo,
    });

    const payload = formDataToDebugPayload(fd);
    console.log('TIP SUBMIT PAYLOAD', payload);

    setSubmitting(true);
    const r = isEdit && editTip
      ? await nestTipUpdateMultipart(apiAccessToken, editTip.id, fd)
      : await nestTipCreateMultipart(apiAccessToken, fd);
    setSubmitting(false);

    console.log('TIP API RESPONSE', r);

    if (!r.ok) {
      setError(r.error ?? 'Uložení tipu selhalo.');
      return;
    }
    const bonusMsg =
      !isEdit && r.data && typeof r.data === 'object' && 'bonusGranted' in r.data
        ? (r.data as { bonusGranted?: { message?: string } }).bonusGranted?.message
        : undefined;
    setSuccessMessage(
      bonusMsg ? `Tip byl publikován. ${bonusMsg}` : 'Tip byl publikován',
    );
    await refresh();
    resetFormState();
    onSaved?.(r.data);
  }

  const displayVideoUrl =
    generatedPreviewUrl ||
    videoPreviewUrl ||
    (videoUrl.trim() ? videoUrl : null) ||
    (generatedVideoUrl.trim() ? generatedVideoUrl : null);

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mx-auto w-full max-w-2xl space-y-6 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6"
    >
      <h2 className="text-lg font-semibold text-zinc-900">
        {isEdit ? 'Upravit tip' : 'Nový tip na nemovitost'}
      </h2>

      {successMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </p>
      ) : null}

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
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Lokalita"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Cena nemovitosti (Kč)"
            type="number"
            min={0}
            value={propertyPrice}
            onChange={(e) => setPropertyPrice(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Fotky a video</legend>
        <input
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={onPickImageFiles}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#e85d00] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
        {imageItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {imageItems.map((img, index) => (
              <div key={img.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.previewUrl} alt="" className="h-28 w-full object-cover sm:h-32" />
                <div className="flex flex-wrap gap-1 p-1.5">
                  <button type="button" onClick={() => moveImage(index, -1)} className="rounded border px-1.5 py-0.5 text-[10px]">←</button>
                  <button type="button" onClick={() => moveImage(index, 1)} className="rounded border px-1.5 py-0.5 text-[10px]">→</button>
                  {index > 0 ? (
                    <button type="button" onClick={() => setAsMainImage(index)} className="rounded border border-[#e85d00]/40 px-1.5 py-0.5 text-[10px] text-[#e85d00]">Hlavní</button>
                  ) : (
                    <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Hlavní</span>
                  )}
                  <button type="button" onClick={() => removeImage(index)} className="ml-auto rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600">Smazat</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <input type="file" accept="video/*" capture="environment" onChange={onPickVideoFile} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
        {displayVideoUrl && !generatedPreviewUrl ? (
          <ShortsVideoFrame src={displayVideoUrl} />
        ) : null}
        {isGeneratedVideoUsed && videoUrl.trim() ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Video je připravené k publikování
          </p>
        ) : null}
      </fieldset>

      <div ref={shortsSectionRef} className="space-y-3 rounded-xl border border-[#e85d00]/25 bg-orange-50/40 p-4">
        <p className="text-sm font-semibold">Shorts video z fotek</p>
        {imageItems.length >= 2 ? (
          <>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-zinc-700">Hudba ve videu (volitelné)</legend>
              <label
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                  !shortsMusicTrackId ? 'border-[#e85d00] bg-orange-50' : 'border-zinc-200 bg-white'
                }`}
              >
                <span className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="shortsMusic"
                    checked={!shortsMusicTrackId}
                    onChange={() => setShortsMusicTrackId('')}
                    className="accent-[#e85d00]"
                  />
                  Bez hudby
                </span>
              </label>
              {shortsMusicTracks.map((track) => {
                const selected = shortsMusicTrackId === track.id;
                return (
                  <label
                    key={track.id}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                      selected ? 'border-[#e85d00] bg-orange-50' : 'border-zinc-200 bg-white'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="radio"
                        name="shortsMusic"
                        checked={selected}
                        onChange={() => setShortsMusicTrackId(track.id)}
                        className="accent-[#e85d00]"
                      />
                      <span className="truncate text-sm">{track.title}</span>
                    </span>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        toggleMusic(track);
                      }}
                      className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                    >
                      {playingMusicId === track.id ? 'Zastavit' : 'Přehrát'}
                    </button>
                  </label>
                );
              })}
              {shortsMusicTracksLoading ? <p className="text-xs text-zinc-500">Načítám hudbu…</p> : null}
            </fieldset>
            <audio ref={audioRef} className="hidden" onEnded={() => setPlayingMusicId(null)} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={shortsTextOverlay} onChange={(e) => setShortsTextOverlay(e.target.checked)} />
              Text s názvem, lokalitou a cenou
            </label>
            {shortsError ? <p className="text-xs text-red-600">{shortsError}</p> : null}
            <button
              type="button"
              disabled={shortsGenerating}
              onClick={() => void generateShortsFromPhotos()}
              className="rounded-full bg-[#e85d00] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {shortsGenerating ? 'Generuji video…' : 'Vygenerovat Shorts video'}
            </button>
          </>
        ) : (
          <p className="text-xs text-zinc-600">Pro generování Shorts přidejte alespoň 2 fotky.</p>
        )}

        {generatedPreviewUrl ? (
          <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-sm font-semibold">Náhled Shorts videa</p>
            <ShortsVideoFrame src={generatedPreviewUrl} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={useGeneratedVideo} className="rounded-full bg-[#e85d00] px-4 py-2 text-xs font-semibold text-white">
                Použít video
              </button>
              <button type="button" onClick={() => void generateShortsFromPhotos()} className="rounded-full border px-4 py-2 text-xs font-semibold">
                Přegenerovat
              </button>
              <button
                type="button"
                onClick={() => {
                  setGeneratedPreviewUrl(null);
                  setGeneratedVideoUrl('');
                  setIsGeneratedVideoUsed(false);
                  shortsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="rounded-full border px-4 py-2 text-xs font-semibold"
              >
                Vybrat jinou hudbu
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <input placeholder="Odkaz na zdroj" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className={inputClass} />
        <textarea placeholder="Vlastní poznámka" rows={2} value={ownerNote} onChange={(e) => setOwnerNote(e.target.value)} className={inputClass} />
        <div className="grid gap-3 sm:grid-cols-3">
          <input placeholder="Kontakt — jméno" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
          <input
            placeholder="Telefon *"
            required
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputClass}
          />
          <input placeholder="E-mail" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} />
        </div>
        <input type="number" min={0} placeholder="Cena za odemčení kontaktu (Kč)" value={contactUnlockPrice} onChange={(e) => setContactUnlockPrice(e.target.value)} className={inputClass} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={isShorts} onChange={(e) => setIsShorts(e.target.checked)} className="mt-1" />
          <span>
            <strong>Zobrazit jako Shorts tip na nemovitost</strong>
            <span className="mt-0.5 block text-xs text-zinc-500">Vyžaduje video nebo vygenerované video z fotek.</span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={submitting} className="rounded-full bg-[#e85d00] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {submitting ? 'Ukládám…' : isEdit ? 'Uložit změny' : 'Publikovat tip'}
        </button>
        {onCancel ? (
          <button type="button" onClick={() => { stopMusic(); onCancel(); }} className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700">
            Zavřít
          </button>
        ) : null}
      </div>
    </form>
  );
}
