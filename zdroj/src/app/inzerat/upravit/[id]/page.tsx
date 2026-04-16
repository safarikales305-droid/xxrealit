'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestFetchPropertyDetailJson, nestPatchMyProperty } from '@/lib/nest-client';

function pickStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function pickNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function pickBool(v: unknown): boolean {
  return v === true;
}
function pickStrList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
}

export default function UpravitInzeratPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const router = useRouter();
  const { apiAccessToken, isAuthenticated, isLoading } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [currency, setCurrency] = useState('CZK');
  const [offerType, setOfferType] = useState('prodej');
  const [propertyType, setPropertyType] = useState('byt');
  const [subType, setSubType] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [landArea, setLandArea] = useState('');
  const [floor, setFloor] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [condition, setCondition] = useState('');
  const [construction, setConstruction] = useState('');
  const [ownership, setOwnership] = useState('');
  const [energyLabel, setEnergyLabel] = useState('');
  const [equipment, setEquipment] = useState('');
  const [parking, setParking] = useState(false);
  const [cellar, setCellar] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isOwnerListing, setIsOwnerListing] = useState(false);
  const [ownerContactConsent, setOwnerContactConsent] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [imagesText, setImagesText] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id || !apiAccessToken) return;
    setLoadErr(null);
    const raw = await nestFetchPropertyDetailJson(id, apiAccessToken);
    if (!raw || typeof raw !== 'object') {
      setLoadErr('Inzerát se nepodařilo načíst nebo k němu nemáte přístup.');
      return;
    }
    const root = raw as Record<string, unknown>;
    const p = root.property;
    if (!p || typeof p !== 'object') {
      setLoadErr('Neplatná odpověď serveru.');
      return;
    }
    const o = p as Record<string, unknown>;
    setTitle(pickStr(o.title));
    setDescription(pickStr(o.description));
    setPrice(String(pickNum(o.price)));
    setCity(pickStr(o.city));
    setRegion(pickStr(o.region));
    setDistrict(pickStr(o.district));
    setCurrency(pickStr(o.currency) || 'CZK');
    setOfferType(pickStr(o.offerType) || 'prodej');
    setPropertyType(pickStr(o.propertyType) || 'byt');
    setSubType(pickStr(o.subType));
    setAddress(pickStr(o.address));
    setArea(typeof o.area === 'number' ? String(o.area) : '');
    setLandArea(typeof o.landArea === 'number' ? String(o.landArea) : '');
    setFloor(typeof o.floor === 'number' ? String(o.floor) : '');
    setTotalFloors(typeof o.totalFloors === 'number' ? String(o.totalFloors) : '');
    setCondition(pickStr(o.condition));
    setConstruction(pickStr(o.construction));
    setOwnership(pickStr(o.ownership));
    setEnergyLabel(pickStr(o.energyLabel));
    setEquipment(pickStr(o.equipment));
    setParking(pickBool(o.parking));
    setCellar(pickBool(o.cellar));
    setContactName(pickStr(o.contactName));
    setContactPhone(pickStr(o.contactPhone));
    setContactEmail(pickStr(o.contactEmail));
    setIsOwnerListing(pickBool(o.isOwnerListing));
    setOwnerContactConsent(pickBool(o.ownerContactConsent));
    setVideoUrl(pickStr(o.videoUrl));
    setImagesText(pickStrList(o.images).join('\n'));
    setIsActive(pickBool(o.isActive) !== false);
  }, [id, apiAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-600">Načítání…</div>
    );
  }

  if (!isAuthenticated || !apiAccessToken) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-zinc-800">Pro úpravu inzerátu se přihlaste.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3 text-sm font-semibold text-white"
        >
          Přihlásit se
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-20">
      <Link href="/profil" className="text-sm font-semibold text-[#e85d00] hover:underline">
        ← Profil
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">Upravit inzerát</h1>
      {loadErr ? (
        <p className="mt-4 text-sm text-red-600">{loadErr}</p>
      ) : (
        <form
          className="mt-8 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            setSaveErr(null);
            const p = Number(price);
            if (!Number.isFinite(p) || p < 0) {
              setSaveErr('Neplatná cena.');
              return;
            }
            const toNumberOrUndefined = (v: string): number | undefined => {
              const trimmed = v.trim();
              if (!trimmed) return undefined;
              const n = Number(trimmed.replace(',', '.'));
              return Number.isFinite(n) ? n : undefined;
            };
            const toIntOrUndefined = (v: string): number | undefined => {
              const trimmed = v.trim();
              if (!trimmed) return undefined;
              const n = Number.parseInt(trimmed, 10);
              return Number.isFinite(n) ? n : undefined;
            };
            const images = imagesText
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean);
            setSaving(true);
            void nestPatchMyProperty(apiAccessToken, id, {
              title: title.trim(),
              description: description.trim(),
              price: p,
              currency: currency.trim() || 'CZK',
              type: offerType.trim() || 'prodej',
              propertyType: propertyType.trim() || 'byt',
              subType: subType.trim(),
              address: address.trim(),
              city: city.trim(),
              region: region.trim(),
              district: district.trim(),
              area: toNumberOrUndefined(area),
              landArea: toNumberOrUndefined(landArea),
              floor: toIntOrUndefined(floor),
              totalFloors: toIntOrUndefined(totalFloors),
              condition: condition.trim(),
              construction: construction.trim(),
              ownership: ownership.trim(),
              energyLabel: energyLabel.trim(),
              equipment: equipment.trim(),
              parking,
              cellar,
              contactName: contactName.trim(),
              contactPhone: contactPhone.trim(),
              contactEmail: contactEmail.trim(),
              isOwnerListing,
              ownerContactConsent,
              images,
              videoUrl: videoUrl.trim(),
              isActive,
            }).then((r) => {
              setSaving(false);
              if (!r.ok) {
                setSaveErr(r.error ?? 'Uložení se nezdařilo.');
                return;
              }
              router.push('/profil');
              router.refresh();
            });
          }}
        >
          <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <h2 className="text-base font-bold text-zinc-900">Základní údaje</h2>
            <label className="block text-sm font-semibold text-zinc-800">
              Název
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Popis
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={6}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Cena (číslo)
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Město
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Region
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
            <label className="block text-sm font-semibold text-zinc-800">
              Okres
              <input value={district} onChange={(e) => setDistrict(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold text-zinc-800">Měna<input value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Typ nabídky<input value={offerType} onChange={(e) => setOfferType(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Typ nemovitosti<input value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
            </div>
            <label className="block text-sm font-semibold text-zinc-800">Podtyp<input value={subType} onChange={(e) => setSubType(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
            <label className="block text-sm font-semibold text-zinc-800">Adresa<input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
          </section>

          <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <h2 className="text-base font-bold text-zinc-900">Parametry</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-zinc-800">Plocha (m²)<input value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Pozemek (m²)<input value={landArea} onChange={(e) => setLandArea(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Patro<input value={floor} onChange={(e) => setFloor(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Počet pater<input value={totalFloors} onChange={(e) => setTotalFloors(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Stav<input value={condition} onChange={(e) => setCondition(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Konstrukce<input value={construction} onChange={(e) => setConstruction(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Vlastnictví<input value={ownership} onChange={(e) => setOwnership(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Energetický štítek<input value={energyLabel} onChange={(e) => setEnergyLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
            </div>
            <label className="block text-sm font-semibold text-zinc-800">Vybavení<textarea value={equipment} onChange={(e) => setEquipment(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-800"><input type="checkbox" checked={parking} onChange={(e) => setParking(e.target.checked)} />Parkování</label>
              <label className="flex items-center gap-2 text-sm text-zinc-800"><input type="checkbox" checked={cellar} onChange={(e) => setCellar(e.target.checked)} />Sklep</label>
            </div>
          </section>

          <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <h2 className="text-base font-bold text-zinc-900">Média (foto / video)</h2>
            <label className="block text-sm font-semibold text-zinc-800">Video URL<input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
            <label className="block text-sm font-semibold text-zinc-800">
              URL fotek (1 řádek = 1 URL)
              <textarea value={imagesText} onChange={(e) => setImagesText(e.target.value)} rows={6} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
            </label>
          </section>

          <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <h2 className="text-base font-bold text-zinc-900">Kontakt a publikace</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold text-zinc-800">Kontakt<input value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Telefon<input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-semibold text-zinc-800">Email<input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /></label>
            </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 rounded border-zinc-300"
            />
            Inzerát je aktivní (veřejně po schválení a v časovém okně)
          </label>
            <label className="flex items-center gap-2 text-sm text-zinc-800"><input type="checkbox" checked={isOwnerListing} onChange={(e) => setIsOwnerListing(e.target.checked)} />Inzerát vlastníka</label>
            <label className="flex items-center gap-2 text-sm text-zinc-800"><input type="checkbox" checked={ownerContactConsent} onChange={(e) => setOwnerContactConsent(e.target.checked)} />Souhlas s kontaktem vlastníka</label>
          </section>
          {saveErr ? <p className="text-sm text-red-600">{saveErr}</p> : null}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? 'Ukládám…' : 'Uložit změny'}
            </button>
            <Link
              href={`/nemovitost/${id}`}
              className="rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-semibold text-zinc-800"
            >
              Zrušit
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
