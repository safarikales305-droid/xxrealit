'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestApiConfigured, nestCreatePropertyListing, nestUploadPropertyImages } from '@/lib/nest-client';

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

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [videoUrl, setVideoUrl] = useState('');

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    setPendingFiles(Array.from(list));
    setError(null);
    e.target.value = '';
  }, []);

  const uploadPending = useCallback(async () => {
    if (!apiAccessToken || pendingFiles.length === 0) {
      setError('Vyberte soubory a buďte přihlášeni.');
      return;
    }
    setUploading(true);
    setError(null);
    const r = await nestUploadPropertyImages(apiAccessToken, pendingFiles);
    setUploading(false);
    if (!r.ok) {
      setError(r.error ?? 'Nahrání selhalo');
      return;
    }
    setImageUrls((prev) => [...prev, ...r.urls]);
    setPendingFiles([]);
  }, [apiAccessToken, pendingFiles]);

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

    const body: Record<string, unknown> = {
      title: t,
      description: description.trim(),
      price: priceNum,
      currency: currency.trim() || 'CZK',
      type: offerType.trim(),
      propertyType: propertyType.trim(),
      subType: subType.trim(),
      address: address.trim(),
      city: c,
      equipment: equipment.trim() || undefined,
      parking,
      cellar,
      images: imageUrls,
      videoUrl: videoUrl.trim() || undefined,
      contactName: cn,
      contactPhone: cp,
      contactEmail: ce,
    };

    const a = parseFloat(area.replace(',', '.'));
    if (Number.isFinite(a)) body.area = a;
    const la = parseFloat(landArea.replace(',', '.'));
    if (Number.isFinite(la)) body.landArea = la;
    const fl = parseInt(floor, 10);
    if (Number.isFinite(fl)) body.floor = fl;
    const tf = parseInt(totalFloors, 10);
    if (Number.isFinite(tf)) body.totalFloors = tf;
    if (condition.trim()) body.condition = condition.trim();
    if (construction.trim()) body.construction = construction.trim();
    if (ownership.trim()) body.ownership = ownership.trim();
    if (energyLabel.trim()) body.energyLabel = energyLabel.trim();

    setSubmitting(true);
    const r = await nestCreatePropertyListing(apiAccessToken, body);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení selhalo');
      return;
    }
    setSuccess(true);
    setTitle('');
    setDescription('');
    setPrice('');
    setImageUrls([]);
    setVideoUrl('');
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
        <p className="mb-3 text-sm text-zinc-600">📸 Fotky (JPG, PNG, WebP, GIF)</p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={onPickFiles}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-orange-600"
        />
        {pendingFiles.length > 0 ? (
          <p className="mt-2 text-xs text-zinc-500">
            Vybráno: {pendingFiles.length} soubor(ů)
          </p>
        ) : null}
        <button
          type="button"
          disabled={uploading || pendingFiles.length === 0}
          onClick={() => void uploadPending()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-50"
        >
          {uploading ? (
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          ) : null}
          {uploading ? 'Nahrávám…' : 'Nahrát vybrané fotky'}
        </button>
        {imageUrls.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-600">
            {imageUrls.map((u) => (
              <li
                key={u}
                className="max-w-[200px] truncate rounded-lg bg-zinc-100 px-2 py-1 font-mono"
                title={u}
              >
                {u}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Zatím žádné nahrané URL.</p>
        )}
        <div className="mt-6">
          <label className={labelClass} htmlFor="videoUrl">
            🎥 Odkaz na video (YouTube / URL)
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
        {submitting ? 'Odesílám…' : 'Odeslat inzerát'}
      </button>
    </form>
  );
}
