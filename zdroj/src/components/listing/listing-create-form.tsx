'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestApiConfigured,
  nestCreatePropertyListingMultipart,
  nestGeneratePropertyShortsFromPhotos,
} from '@/lib/nest-client';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-800';
const sectionTitle =
  'mb-4 flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900';

export function ListingCreateForm() {
  const { apiAccessToken } = useAuth();

  const [offerType, setOfferType] = useState('prodej');
  const [propertyType, setPropertyType] = useState('byt');
  const [subType, setSubType] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  const [area, setArea] = useState('');
  const [landArea, setLandArea] = useState('');
  const [floor, setFloor] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [condition, setCondition] = useState('');
  const [construction, setConstruction] = useState('');
  const [ownership, setOwnership] = useState('');
  const [energyLabel, setEnergyLabel] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [equipment, setEquipment] = useState('');
  const [parking, setParking] = useState(false);
  const [cellar, setCellar] = useState(false);

  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('CZK');

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<Array<{ id: string; file: File; previewUrl: string }>>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [shortsMusicKey, setShortsMusicKey] = useState<
    'none' | 'demo_soft' | 'demo_warm' | 'demo_pulse'
  >('demo_soft');
  const [shortsTextOverlay, setShortsTextOverlay] = useState(true);
  const [shortsGenerating, setShortsGenerating] = useState(false);
  const [shortsError, setShortsError] = useState<string | null>(null);
  const [shortsSuccess, setShortsSuccess] = useState<string | null>(null);

  const onPickImageFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [imageFiles]);

  const onPickVideoFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    const file = list?.[0] ?? null;
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
  }, [videoPreviewUrl]);

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
      const priceNum = Math.round(Number(price));
      if (!t || !c || !Number.isFinite(priceNum) || priceNum < 0) {
        setShortsError(
          'Pro text ve videu nejdřív vyplňte titulek, město a cenu v sekci výše.',
        );
        return;
      }
    }

    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('city', city.trim());
    fd.append('price', String(Math.round(Number(price)) || 0));
    fd.append('currency', currency.trim() || 'CZK');
    fd.append('musicKey', shortsMusicKey);
    fd.append('includeTextOverlay', String(shortsTextOverlay));
    for (const img of imagePreviews) {
      fd.append('images', img.file);
    }

    setShortsGenerating(true);
    const r = await nestGeneratePropertyShortsFromPhotos(apiAccessToken, fd);
    setShortsGenerating(false);
    if (!r.ok) {
      setShortsError(r.error ?? 'Generování selhalo.');
      return;
    }
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoUrl(r.videoUrl);
    setShortsSuccess(
      'Shorts video je hotové a bude použito ve shorts feedu po uložení inzerátu.',
    );
  }, [
    apiAccessToken,
    city,
    currency,
    imagePreviews,
    price,
    shortsMusicKey,
    shortsTextOverlay,
    title,
    videoPreviewUrl,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!nestApiConfigured() || !apiAccessToken) {
      setError('Nastavte NEXT_PUBLIC_API_URL a přihlaste se (Nest JWT).');
      return;
    }

    const t = title.trim();
    const c = city.trim();
    const priceNum = Math.round(Number(price));
    if (!t || !c || !Number.isFinite(priceNum) || priceNum < 0) {
      setError('Vyplňte titulek, město a platnou cenu.');
      return;
    }
    if (!offerType.trim() || !propertyType.trim()) {
      setError('Zvolte typ nabídky a typ nemovitosti.');
      return;
    }
    if (!description.trim()) {
      setError('Vyplňte popis inzerátu.');
      return;
    }
    const cn = contactName.trim();
    const cp = contactPhone.trim();
    const ce = contactEmail.trim();
    if (!cn || !cp || !ce) {
      setError('Vyplňte kontaktní údaje.');
      return;
    }

    if (imagePreviews.length > 30) {
      setError('Max 30 fotek');
      return;
    }

    console.log('TITLE:', t);
    console.log('DESCRIPTION:', description.trim());
    console.log('PRICE:', priceNum);
    console.log('CITY:', c);
    console.log('VIDEO FILE:', videoFile);
    console.log(
      'IMAGES:',
      imagePreviews.map((x) => x.file.name),
    );

    const fd = new FormData();
    fd.append('title', t);
    fd.append('description', description.trim());
    fd.append('price', String(priceNum));
    fd.append('currency', currency.trim() || 'CZK');
    fd.append('type', offerType.trim());
    fd.append('propertyType', propertyType.trim());
    fd.append('subType', subType.trim());
    fd.append('address', address.trim());
    fd.append('city', c);
    fd.append('equipment', equipment.trim());
    fd.append('parking', String(parking));
    fd.append('cellar', String(cellar));
    fd.append('contactName', cn);
    fd.append('contactPhone', cp);
    fd.append('contactEmail', ce);
    if (videoUrl.trim()) fd.append('videoUrl', videoUrl.trim());
    if (condition.trim()) fd.append('condition', condition.trim());
    if (construction.trim()) fd.append('construction', construction.trim());
    if (ownership.trim()) fd.append('ownership', ownership.trim());
    if (energyLabel.trim()) fd.append('energyLabel', energyLabel.trim());
    if (area.trim()) fd.append('area', area.trim());
    if (landArea.trim()) fd.append('landArea', landArea.trim());
    if (floor.trim()) fd.append('floor', floor.trim());
    if (totalFloors.trim()) fd.append('totalFloors', totalFloors.trim());

    if (videoFile) {
      fd.append('video', videoFile);
    }
    const orderedImages = imagePreviews.map((x) => x.file);
    orderedImages.forEach((file, index) => {
      fd.append('images', file);
      fd.append('imageOrder', String(index + 1));
    });
    for (const pair of fd.entries()) {
      console.log('FORMDATA:', pair[0], pair[1]);
    }

    setSubmitting(true);
    const r = await nestCreatePropertyListingMultipart(apiAccessToken, fd);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení selhalo');
      return;
    }
    setSuccess(true);
    setTitle('');
    setDescription('');
    setPrice('');
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
    setAddress('');
    setCity('');
    setSubType('');
    setArea('');
    setLandArea('');
    setFloor('');
    setTotalFloors('');
    setCondition('');
    setConstruction('');
    setOwnership('');
    setEnergyLabel('');
    setEquipment('');
    setParking(false);
    setCellar(false);
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mx-auto w-full max-w-3xl space-y-10 pb-16"
    >
      {success ? (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-900"
          role="status"
        >
          Inzerát čeká na schválení administrátorem. Po schválení se zobrazí na hlavní stránce.
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <fieldset className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <legend className={sectionTitle}>
          <span className="text-lg">🟢</span> Základní údaje
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="offerType">
              Typ nabídky
            </label>
            <select
              id="offerType"
              value={offerType}
              onChange={(e) => setOfferType(e.target.value)}
              className={inputClass}
            >
              <option value="prodej">Prodej</option>
              <option value="pronájem">Pronájem</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="propertyType">
              Typ nemovitosti
            </label>
            <select
              id="propertyType"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className={inputClass}
            >
              <option value="byt">Byt</option>
              <option value="dům">Dům</option>
              <option value="pozemek">Pozemek</option>
              <option value="komerční">Komerční</option>
              <option value="ostatní">Ostatní</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className={labelClass} htmlFor="subType">
            Podkategorie (např. 2+1, řadový dům)
          </label>
          <input
            id="subType"
            value={subType}
            onChange={(e) => setSubType(e.target.value)}
            className={inputClass}
            placeholder="Volitelné"
          />
        </div>
        <div className="mt-4">
          <label className={labelClass} htmlFor="address">
            Adresa
          </label>
          <input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
            placeholder="Ulice a číslo"
          />
        </div>
        <div className="mt-4">
          <label className={labelClass} htmlFor="city">
            Město <span className="text-red-600">*</span>
          </label>
          <input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
            required
            placeholder="Praha"
          />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <legend className={sectionTitle}>
          <span className="text-lg">🟢</span> Technické parametry
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="area">
              Plocha (m²)
            </label>
            <input
              id="area"
              type="text"
              inputMode="decimal"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="landArea">
              Pozemek (m²)
            </label>
            <input
              id="landArea"
              type="text"
              inputMode="decimal"
              value={landArea}
              onChange={(e) => setLandArea(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="floor">
              Podlaží
            </label>
            <input
              id="floor"
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="totalFloors">
              Celkem podlaží domu
            </label>
            <input
              id="totalFloors"
              type="number"
              value={totalFloors}
              onChange={(e) => setTotalFloors(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="condition">
              Stav
            </label>
            <input
              id="condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className={inputClass}
              placeholder="Novostavba, po rekonstrukci…"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="construction">
              Konstrukce
            </label>
            <input
              id="construction"
              value={construction}
              onChange={(e) => setConstruction(e.target.value)}
              className={inputClass}
              placeholder="Cihla, panel…"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ownership">
              Vlastnictví
            </label>
            <input
              id="ownership"
              value={ownership}
              onChange={(e) => setOwnership(e.target.value)}
              className={inputClass}
              placeholder="Osobní, družstevní…"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="energyLabel">
              Energetická třída
            </label>
            <input
              id="energyLabel"
              value={energyLabel}
              onChange={(e) => setEnergyLabel(e.target.value)}
              className={inputClass}
              placeholder="A–G"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <legend className={sectionTitle}>
          <span className="text-lg">🟢</span> Popis
        </legend>
        <div>
          <label className={labelClass} htmlFor="title">
            Titulek <span className="text-red-600">*</span>
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            required
            maxLength={500}
          />
        </div>
        <div className="mt-4">
          <label className={labelClass} htmlFor="description">
            Popis <span className="text-red-600">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className={`${inputClass} resize-y min-h-[140px]`}
            required
            placeholder="Detailní popis nemovitosti…"
          />
        </div>
        <div className="mt-4">
          <label className={labelClass} htmlFor="equipment">
            Vybavení
          </label>
          <textarea
            id="equipment"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            rows={3}
            className={`${inputClass} resize-y`}
            placeholder="Kuchyňská linka, spotřebiče…"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800">
            <input
              type="checkbox"
              checked={parking}
              onChange={(e) => setParking(e.target.checked)}
              className="size-4 rounded border-zinc-300 text-[#ff6a00] focus:ring-[#ff6a00]/30"
            />
            Parkování
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800">
            <input
              type="checkbox"
              checked={cellar}
              onChange={(e) => setCellar(e.target.checked)}
              className="size-4 rounded border-zinc-300 text-[#ff6a00] focus:ring-[#ff6a00]/30"
            />
            Sklep
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <legend className={sectionTitle}>
          <span className="text-lg">🟢</span> Cena
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="price">
              Cena <span className="text-red-600">*</span>
            </label>
            <input
              id="price"
              type="number"
              min={0}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="currency">
              Měna
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass}
            >
              <option value="CZK">CZK</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <legend className={sectionTitle}>
          <span className="text-lg">🟢</span> Multimédia
        </legend>
        <p className="mb-2 text-sm text-zinc-600">🎥 Video (max 1, bude první)</p>
        <input
          type="file"
          accept="video/*"
          onChange={onPickVideoFile}
          className="mb-4 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-black"
        />
        {videoPreviewUrl ? (
          <div className="mb-4 overflow-hidden rounded-2xl border border-zinc-200">
            <div className="relative">
              <video src={videoPreviewUrl} controls playsInline className="h-auto w-full object-contain" />
              <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                Video / bude první
              </span>
            </div>
          </div>
        ) : null}

        <p className="mb-3 text-sm text-zinc-600">📸 Fotky (max 30)</p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/*"
          multiple
          onChange={onPickImageFiles}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-orange-600"
        />
        {imagePreviews.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {imagePreviews.map((img, index) => (
              <div key={img.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                <div className="relative">
                  <img src={img.previewUrl} alt="" className="h-40 w-full object-cover" />
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2">
                  <div className="truncate text-xs text-zinc-500">{img.file.name}</div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveImageLeft(index)} className="rounded-lg border px-2 py-1 text-xs">←</button>
                    <button type="button" onClick={() => moveImageRight(index)} className="rounded-lg border px-2 py-1 text-xs">→</button>
                    <button type="button" onClick={() => removeImage(index)} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Zatím žádné vybrané fotky.</p>
        )}

        {imagePreviews.length >= 2 ? (
          <div
            className={`mt-6 rounded-2xl border p-4 ${
              videoFile
                ? 'border-zinc-200 bg-zinc-50/80'
                : 'border-[#ff6a00]/35 bg-gradient-to-br from-orange-50/90 to-white'
            }`}
          >
            <p className="text-sm font-semibold text-zinc-900">Nemáte vlastní video?</p>
            <p className="mt-1 text-sm text-zinc-600">
              Vytvoříme vám krátké vertikální shorts (9:16, MP4) z nahraných fotek — plynulé přechody,
              volitelná demo hudba a text s titulkem, lokalitou a cenou.
            </p>
            {videoFile ? (
              <p className="mt-2 text-xs text-zinc-500">
                Máte nahrané vlastní video. Po vygenerování shorts se nahrané video zruší a použije se
                nové z fotek.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="shortsMusic">
                  Vyberte hudbu
                </label>
                <select
                  id="shortsMusic"
                  value={shortsMusicKey}
                  onChange={(e) =>
                    setShortsMusicKey(
                      e.target.value as 'none' | 'demo_soft' | 'demo_warm' | 'demo_pulse',
                    )
                  }
                  disabled={shortsGenerating}
                  className={inputClass}
                >
                  <option value="none">Bez hudby</option>
                  <option value="demo_soft">Demo jemná linka (220 Hz)</option>
                  <option value="demo_warm">Demo teplejší tón (330 Hz)</option>
                  <option value="demo_pulse">Demo dvojtónový podklad</option>
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  Jednoduché generované stopy vhodné jen jako ukázka — později půjde doplnit vlastní
                  knihovna skladeb.
                </p>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-800 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={shortsTextOverlay}
                  onChange={(e) => setShortsTextOverlay(e.target.checked)}
                  disabled={shortsGenerating}
                  className="mt-0.5 size-4 rounded border-zinc-300 text-[#ff6a00] focus:ring-[#ff6a00]/30"
                />
                <span>
                  Přidat text do videa (název inzerátu, město, cena) — jednoduchý přehledný overlay
                  dole u záběru.
                </span>
              </label>
            </div>

            {shortsError ? (
              <div
                className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {shortsError}
              </div>
            ) : null}
            {shortsSuccess ? (
              <div
                className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                role="status"
              >
                {shortsSuccess}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void generateShortsFromPhotos()}
              disabled={shortsGenerating}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#ff6a00]/40 bg-white px-4 py-3 text-sm font-semibold text-[#ff3c00] shadow-sm transition hover:bg-orange-50 disabled:opacity-60 sm:w-auto"
            >
              {shortsGenerating ? (
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-[#ff6a00] border-t-transparent" />
              ) : null}
              {shortsGenerating ? 'Generuji video…' : 'Vygenerovat shorts video z fotek'}
            </button>
          </div>
        ) : null}

        {videoUrl.trim().startsWith('https://') && !videoFile ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
            <div className="relative">
              <video
                src={videoUrl.trim()}
                controls
                playsInline
                className="h-auto max-h-[420px] w-full object-contain bg-black"
              />
              <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                Shorts / odkaz na video
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <label className={labelClass} htmlFor="videoUrl">
            🎥 Odkaz na video (volitelné)
          </label>
          <input
            id="videoUrl"
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className={inputClass}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <legend className={sectionTitle}>
          <span className="text-lg">🟢</span> Kontakt
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="contactName">
              Jméno
            </label>
            <input
              id="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="contactPhone">
              Telefon
            </label>
            <input
              id="contactPhone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className={inputClass}
              required
              minLength={3}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="contactEmail">
              E-mail
            </label>
            <input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={inputClass}
              required
            />
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60 sm:w-auto sm:min-w-[220px] sm:px-10"
      >
        {submitting ? (
          <span className="inline-block size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : null}
        {submitting ? 'Ukládám...' : 'Vložit inzerát'}
      </button>
    </form>
  );
}
