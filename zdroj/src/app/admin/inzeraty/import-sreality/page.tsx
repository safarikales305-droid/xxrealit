'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AdminSubPage } from '@/components/admin/AdminSubPage';
import {
  nestAdminSrealityImportPreview,
  nestAdminSrealityImportPublish,
  type SrealityImportPreviewResponse,
  type SrealityImportPublishPayload,
} from '@/lib/sreality-import-admin-api';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';

function brokerMatchLabel(status: SrealityImportPreviewResponse['brokerMatchStatus']): string {
  switch (status) {
    case 'EXISTING_PROFILE':
      return 'NALEZEN · EXISTUJÍCÍ PROFIL';
    case 'NEW_IMPORTED_CONTACT':
      return 'NALEZEN · NOVÝ IMPORTOVANÝ KONTAKT';
    default:
      return 'KONTAKT NENALEZEN';
  }
}

function diagLabel(value: string | undefined): string {
  if (!value) return '—';
  if (value === 'PASS') return 'PASS';
  if (value === 'FAIL') return 'FAIL';
  if (value === 'NOT_REQUIRED') return 'NOT REQUIRED';
  if (value === 'NOT_PUBLIC') return 'NOT PUBLIC';
  if (value === 'PARTIAL') return 'PARTIAL';
  return value;
}

export default function AdminSrealityImportPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SrealityImportPreviewResponse | null>(null);

  const [form, setForm] = useState<Partial<SrealityImportPublishPayload>>({});
  const [autoReel, setAutoReel] = useState(true);
  const [pubFb, setPubFb] = useState(true);
  const [pubIg, setPubIg] = useState(true);
  const [pubYt, setPubYt] = useState(true);
  const [pubShorts, setPubShorts] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const applyPreviewToForm = useCallback((p: SrealityImportPreviewResponse) => {
    const pre = p.prefill as Record<string, unknown>;
    const broker = p.broker;
    const contactName =
      broker.agentName && broker.companyName
        ? `${broker.agentName} · ${broker.companyName}`
        : broker.agentName || broker.companyName || '';
    setForm({
      title: String(p.aiText.rewrittenTitle ?? pre.title ?? ''),
      description: String(p.aiText.rewrittenDescription ?? pre.description ?? ''),
      offerType: String(pre.offerType ?? 'prodej'),
      propertyType: String(pre.propertyType ?? 'byt'),
      subType: String(pre.subType ?? ''),
      price: typeof pre.price === 'number' ? pre.price : null,
      currency: String(pre.currency ?? 'CZK'),
      city: String(pre.city ?? ''),
      district: String(pre.district ?? ''),
      region: String(pre.region ?? ''),
      address: String(pre.address ?? ''),
      area: typeof pre.area === 'number' ? pre.area : null,
      landArea: typeof pre.landArea === 'number' ? pre.landArea : null,
      floor: typeof pre.floor === 'number' ? pre.floor : null,
      totalFloors: typeof pre.totalFloors === 'number' ? pre.totalFloors : null,
      condition: String(pre.condition ?? ''),
      construction: String(pre.construction ?? ''),
      ownership: String(pre.ownership ?? ''),
      energyLabel: String(pre.energyClass ?? pre.energyLabel ?? ''),
      equipment: String(pre.equipment ?? ''),
      contactName,
      contactPhone: broker.phone ?? '',
      contactEmail: broker.email ?? '',
      images: p.images
        .filter((img) => img.storedUrl)
        .map((img, i) => ({
          storedUrl: img.storedUrl!,
          watermarkedUrl: img.watermarkedUrl,
          sortOrder: i,
          isMain: img.isMain,
        })),
    });
  }, []);

  async function handleLoad() {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const p = await nestAdminSrealityImportPreview(token, sourceUrl.trim());
      setPreview(p);
      applyPreviewToForm(p);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : 'Import selhal.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(withReel: boolean) {
    if (!token || !preview) return;
    setPublishing(true);
    setError(null);
    try {
      const payload: SrealityImportPublishPayload = {
        title: form.title ?? '',
        description: form.description ?? '',
        offerType: form.offerType ?? 'prodej',
        propertyType: form.propertyType ?? 'byt',
        subType: form.subType,
        price: form.price,
        currency: form.currency,
        city: form.city ?? '',
        district: form.district,
        region: form.region,
        address: form.address,
        area: form.area,
        landArea: form.landArea,
        floor: form.floor,
        totalFloors: form.totalFloors,
        condition: form.condition,
        construction: form.construction,
        ownership: form.ownership,
        energyLabel: form.energyLabel,
        equipment: form.equipment,
        contactName: form.contactName ?? '',
        contactPhone: form.contactPhone ?? '',
        contactEmail: form.contactEmail ?? '',
        images: form.images ?? [],
        settings: {
          createAiReel: withReel,
          publishFacebook: pubFb,
          publishInstagram: pubIg,
          publishYoutube: pubYt,
          publishShorts: pubShorts,
        },
      };
      const result = await nestAdminSrealityImportPublish(token, preview.draftId, payload);
      router.push(`/admin/inzeraty?highlight=${encodeURIComponent(result.propertyId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publikování selhalo.');
    } finally {
      setPublishing(false);
    }
  }

  if (isLoading) return null;
  if (!user || user.role !== 'ADMIN') {
    return (
      <AdminSubPage title="Import ze Sreality" description="Přístup pouze pro administrátory.">
        <p className="text-sm text-zinc-600">Nejste přihlášeni jako admin.</p>
      </AdminSubPage>
    );
  }

  return (
    <AdminSubPage
      title="Import ze Sreality"
      description="Načtěte veřejný inzerát, zkontrolujte náhled a publikujte na XXREALIT včetně volitelného AI Reelu."
    >
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Importovat inzerát ze Sreality</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="srealityAdminUrl">
              URL inzerátu
            </label>
            <input
              id="srealityAdminUrl"
              type="url"
              className={inputClass}
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://www.sreality.cz/detail/..."
            />
          </div>
          <button
            type="button"
            disabled={loading || !sourceUrl.trim()}
            onClick={() => void handleLoad()}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {loading ? 'Načítám…' : 'Načíst inzerát'}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </section>

      {preview?.duplicate.isDuplicate ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">Tento inzerát už byl importován.</p>
          {preview.duplicate.propertyId ? (
            <Link
              href={`/admin/inzeraty?highlight=${encodeURIComponent(preview.duplicate.propertyId)}`}
              className="mt-2 inline-block text-sm font-semibold text-orange-700 hover:underline"
            >
              Otevřít inzerát
            </Link>
          ) : null}
        </section>
      ) : null}

      {preview && !preview.duplicate.isDuplicate ? (
        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm text-zinc-600">{preview.imageImportStats.message}</p>
            <p className="mt-1 text-xs text-zinc-500">Zdroj: {preview.sourceUrl}</p>
            {preview.diagnostics ? (
              <div className="mt-4">
                <button
                  type="button"
                  className="text-sm font-semibold text-orange-700 hover:underline"
                  onClick={() => setShowDiagnostics((v) => !v)}
                >
                  {showDiagnostics ? 'Skrýt' : 'Zobrazit'} detail importu
                </button>
                {showDiagnostics ? (
                  <dl className="mt-3 grid gap-2 text-xs text-zinc-700 sm:grid-cols-2">
                    <div><dt className="font-semibold">Source parser</dt><dd>{diagLabel(preview.diagnostics.sourceParser)}</dd></div>
                    <div><dt className="font-semibold">Dynamic page</dt><dd>{diagLabel(preview.diagnostics.dynamicPage)}</dd></div>
                    <div><dt className="font-semibold">Gallery</dt><dd>{diagLabel(preview.diagnostics.gallery)} · {preview.diagnostics.galleryCount} FOUND</dd></div>
                    <div><dt className="font-semibold">Images</dt><dd>{preview.diagnostics.imagesDownloadedCount} DOWNLOADED · {preview.diagnostics.imagesFailedCount} failed</dd></div>
                    <div><dt className="font-semibold">Agent</dt><dd>{diagLabel(preview.diagnostics.agent)}</dd></div>
                    <div><dt className="font-semibold">Phone</dt><dd>{diagLabel(preview.diagnostics.phone)}</dd></div>
                    <div><dt className="font-semibold">Email</dt><dd>{diagLabel(preview.diagnostics.email)}</dd></div>
                    <div><dt className="font-semibold">Contact click</dt><dd>{diagLabel(preview.diagnostics.contactClick)}</dd></div>
                    <div><dt className="font-semibold">Storage</dt><dd>{diagLabel(preview.diagnostics.storage)} · {preview.diagnostics.storageCount} UPLOADED</dd></div>
                    <div><dt className="font-semibold">Browser fallback</dt><dd>{diagLabel(preview.diagnostics.browserFallback)}</dd></div>
                  </dl>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h3 className="font-semibold text-zinc-900">Základní údaje</h3>
              <div className="mt-3 space-y-3">
                <input className={inputClass} value={form.title ?? ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputClass} placeholder="Typ nabídky" value={form.offerType ?? ''} onChange={(e) => setForm((f) => ({ ...f, offerType: e.target.value }))} />
                  <input className={inputClass} placeholder="Typ nemovitosti" value={form.propertyType ?? ''} onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))} />
                </div>
                <input className={inputClass} placeholder="Město" value={form.city ?? ''} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                <input className={inputClass} placeholder="Cena" type="number" value={form.price ?? ''} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <h3 className="font-semibold text-zinc-900">Prodejce</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Stav párování: {brokerMatchLabel(preview.brokerMatchStatus)}
              </p>
              {preview.broker.agentName ? (
                <p className="mt-2 text-sm text-zinc-800">
                  Makléř: {preview.broker.agentName}
                  {preview.broker.companyName ? ` · ${preview.broker.companyName}` : ''}
                </p>
              ) : null}
              {preview.brokerMatchStatus === 'NOT_FOUND' &&
              !preview.broker.agentName &&
              !preview.broker.companyName ? (
                <p className="mt-2 text-sm text-amber-700">
                  Kontakt makléře nebyl automaticky nalezen. Doplňte jej ručně.
                </p>
              ) : null}
              {preview.brokerMatchStatus !== 'NOT_FOUND' &&
              !preview.broker.phone &&
              !preview.broker.email ? (
                <p className="mt-2 text-sm text-zinc-600">
                  Telefon/e-mail nebyly veřejně dostupné — doplňte je ručně, pokud je znáte.
                </p>
              ) : null}
              <div className="mt-3 space-y-3">
                <input className={inputClass} placeholder="Makléř / RK" value={form.contactName ?? ''} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
                <input className={inputClass} placeholder="Telefon" value={form.contactPhone ?? ''} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
                <input className={inputClass} placeholder="E-mail" value={form.contactEmail ?? ''} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-900">Popis (AI úprava)</h3>
            <textarea
              className={`${inputClass} mt-3 min-h-[160px]`}
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            {preview.aiText.skipped ? (
              <p className="mt-2 text-xs text-zinc-500">{preview.aiText.reason}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-900">Fotografie</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {(form.images ?? []).map((img, idx) => (
                <div key={`${img.storedUrl}-${idx}`} className="relative overflow-hidden rounded-lg border border-zinc-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.storedUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                  {img.isMain ? (
                    <span className="absolute left-1 top-1 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Hlavní
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-900">AI marketing</h3>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={autoReel} onChange={(e) => setAutoReel(e.target.checked)} />
                Automaticky vytvořit AI Reel
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pubFb} onChange={(e) => setPubFb(e.target.checked)} />
                Facebook
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pubIg} onChange={(e) => setPubIg(e.target.checked)} />
                Instagram
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pubYt} onChange={(e) => setPubYt(e.target.checked)} />
                YouTube Shorts
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pubShorts} onChange={(e) => setPubShorts(e.target.checked)} />
                XXREALIT Shorts
              </label>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold"
              onClick={() => {
                setPreview(null);
                setSourceUrl('');
              }}
            >
              Zrušit
            </button>
            <button
              type="button"
              disabled={publishing}
              className="rounded-xl bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handlePublish(false)}
            >
              Publikovat
            </button>
            <button
              type="button"
              disabled={publishing}
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handlePublish(autoReel)}
            >
              Publikovat + vytvořit AI Reel
            </button>
          </div>
        </div>
      ) : null}
    </AdminSubPage>
  );
}
