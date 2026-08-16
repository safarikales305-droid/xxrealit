'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Star, X } from 'lucide-react';
import {
  CompanyReviewMediaUpload,
  type ReviewMediaItem,
} from '@/components/company-directory/CompanyReviewMediaUpload';
import {
  nestImportCompanyFromAres,
  nestSearchAresCompaniesForReview,
  nestSearchCompaniesForReview,
  nestSubmitCompanyReview,
} from '@/lib/company-directory-client';

type SelectedCompany = {
  id: string;
  name: string;
  ico: string;
  slug?: string | null;
  city?: string | null;
  verifiedBusinessEmail?: string | null;
  aresSource?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  defaultAuthorEmail?: string;
  defaultAuthorName?: string;
};

export function CompanyReviewComposer({
  open,
  onClose,
  defaultAuthorEmail = '',
  defaultAuthorName = '',
}: Props) {
  const [step, setStep] = useState<'company' | 'form' | 'done'>('company');
  const [query, setQuery] = useState('');
  const [dbResults, setDbResults] = useState<Array<Record<string, unknown>>>([]);
  const [aresResults, setAresResults] = useState<Array<Record<string, unknown>>>([]);
  const [searching, setSearching] = useState(false);
  const [aresSearching, setAresSearching] = useState(false);
  const [importingIco, setImportingIco] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedCompany | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [reviewMedia, setReviewMedia] = useState<{ images: ReviewMediaItem[]; videos: ReviewMediaItem[] }>({
    images: [],
    videos: [],
  });
  const [form, setForm] = useState({
    rating: 5,
    sentiment: 'POSITIVE' as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL',
    title: '',
    body: '',
    authorEmail: defaultAuthorEmail,
    authorDisplayName: defaultAuthorName,
    submittedBusinessEmail: '',
    confirmedExperience: false,
  });

  const reset = useCallback(() => {
    setStep('company');
    setQuery('');
    setDbResults([]);
    setAresResults([]);
    setSelected(null);
    setError(null);
    setSuccessMsg(null);
    setReviewMedia({ images: [], videos: [] });
    setForm({
      rating: 5,
      sentiment: 'POSITIVE',
      title: '',
      body: '',
      authorEmail: defaultAuthorEmail,
      authorDisplayName: defaultAuthorName,
      submittedBusinessEmail: '',
      confirmedExperience: false,
    });
  }, [defaultAuthorEmail, defaultAuthorName]);

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({
      ...f,
      authorEmail: defaultAuthorEmail || f.authorEmail,
      authorDisplayName: defaultAuthorName || f.authorDisplayName,
    }));
  }, [open, defaultAuthorEmail, defaultAuthorName]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setDbResults([]);
      return;
    }
    const id = setTimeout(() => {
      setSearching(true);
      void nestSearchCompaniesForReview(query.trim()).then((res) => {
        setDbResults(res?.items ?? []);
        setSearching(false);
      });
    }, 350);
    return () => clearTimeout(id);
  }, [open, query]);

  const showAresFallback = useMemo(
    () => query.trim().length >= 3 && !searching && dbResults.length === 0,
    [query, searching, dbResults.length],
  );

  const selectDbCompany = (row: Record<string, unknown>) => {
    setSelected({
      id: String(row.id),
      name: String(row.name),
      ico: String(row.ico),
      slug: row.slug ? String(row.slug) : null,
      city: row.city ? String(row.city) : null,
      verifiedBusinessEmail: row.verifiedBusinessEmail ? String(row.verifiedBusinessEmail) : null,
      aresSource: Boolean(row.aresSource),
    });
    setStep('form');
    setError(null);
  };

  const importFromAres = async (row: Record<string, unknown>) => {
    const ico = String(row.ico);
    setImportingIco(ico);
    setError(null);
    const res = await nestImportCompanyFromAres(ico);
    setImportingIco(null);
    if (!res?.company) {
      setError(res?.error ?? 'Import firmy z ARES selhal.');
      return;
    }
    selectDbCompany(res.company);
  };

  const searchAres = async () => {
    if (query.trim().length < 3) return;
    setAresSearching(true);
    setError(null);
    const res = await nestSearchAresCompaniesForReview(query.trim());
    setAresResults(res?.items ?? []);
    setAresSearching(false);
    if (!res?.items?.length) {
      setError('Firma nebyla v ARES nalezena.');
    }
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || submitting) return;
    if (!form.body.trim()) {
      setError('Vyplňte text recenze.');
      return;
    }
    if (!form.authorEmail.trim()) {
      setError('Email autora je povinný.');
      return;
    }
    if (!form.confirmedExperience) {
      setError('Potvrďte, že recenze vychází ze skutečné zkušenosti.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const media = [
      ...reviewMedia.images.map((m) => ({
        type: 'IMAGE' as const,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl ?? undefined,
        mimeType: m.mimeType ?? undefined,
      })),
      ...reviewMedia.videos.map((m) => ({
        type: 'VIDEO' as const,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl ?? undefined,
        mimeType: m.mimeType ?? undefined,
      })),
    ];

    const res = await nestSubmitCompanyReview({
      companyId: selected.id,
      rating: form.rating,
      sentiment: form.sentiment,
      title: form.title || undefined,
      body: form.body,
      authorEmail: form.authorEmail,
      authorDisplayName: form.authorDisplayName || undefined,
      submittedBusinessEmail:
        !selected.verifiedBusinessEmail && form.submittedBusinessEmail
          ? form.submittedBusinessEmail
          : undefined,
      confirmedExperience: form.confirmedExperience,
      media: media.length ? media : undefined,
    });
    setSubmitting(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setSuccessMsg(res?.message ?? 'Recenze odeslána. Zkontrolujte email pro ověření.');
    setStep('done');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Recenze firmy</p>
            <h2 className="text-lg font-bold text-zinc-900">
              {step === 'company' ? 'O jaké firmě chcete napsat?' : 'Napište zkušenost s firmou'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-full border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50"
            aria-label="Zavřít"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {step === 'company' ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={query}
                  onChange={(e) => {
                    setAresResults([]);
                    setQuery(e.target.value);
                  }}
                  placeholder="Název firmy nebo IČO"
                  className="w-full rounded-2xl border border-zinc-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15"
                  autoFocus
                />
              </div>

              {searching ? (
                <p className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="size-4 animate-spin" /> Hledám v XXREALIT…
                </p>
              ) : null}

              {dbResults.length > 0 ? (
                <ul className="space-y-2">
                  {dbResults.map((row) => (
                    <li key={String(row.id)}>
                      <button
                        type="button"
                        onClick={() => selectDbCompany(row)}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-left hover:border-orange-300 hover:bg-orange-50/40"
                      >
                        <p className="font-semibold text-zinc-900">{String(row.name)}</p>
                        <p className="text-xs text-zinc-500">
                          IČO {String(row.ico)}
                          {row.city ? ` · ${String(row.city)}` : ''}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {showAresFallback ? (
                <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm">
                  <p className="text-zinc-600">Firma zatím není na XXREALIT.</p>
                  <button
                    type="button"
                    onClick={() => void searchAres()}
                    disabled={aresSearching}
                    className="mt-2 font-semibold text-orange-700 hover:underline disabled:opacity-50"
                  >
                    {aresSearching ? 'Vyhledávám v ARES…' : 'Vyhledat v ARES'}
                  </button>
                </div>
              ) : null}

              {aresResults.length > 0 ? (
                <ul className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Výsledky ARES</p>
                  {aresResults.map((row) => (
                    <li key={String(row.ico)}>
                      <button
                        type="button"
                        disabled={importingIco === String(row.ico)}
                        onClick={() =>
                          row.inDatabase && row.companyId
                            ? selectDbCompany({
                                id: row.companyId,
                                name: row.name,
                                ico: row.ico,
                                slug: row.slug,
                                city: row.city,
                              })
                            : void importFromAres(row)
                        }
                        className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-left hover:border-orange-300 hover:bg-orange-50/40 disabled:opacity-60"
                      >
                        <p className="font-semibold text-zinc-900">{String(row.name)}</p>
                        <p className="text-xs text-zinc-500">
                          IČO {String(row.ico)}
                          {row.city ? ` · ${String(row.city)}` : ''}
                          {row.address ? ` · ${String(row.address)}` : ''}
                        </p>
                        {importingIco === String(row.ico) ? (
                          <p className="mt-1 text-xs text-orange-700">Importuji z ARES…</p>
                        ) : row.inDatabase ? (
                          <p className="mt-1 text-xs text-emerald-700">Již v databázi XXREALIT</p>
                        ) : (
                          <p className="mt-1 text-xs text-zinc-500">Importovat a pokračovat</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {step === 'form' && selected ? (
            <form id="company-review-form" onSubmit={(e) => void submitReview(e)} className="space-y-3">
              <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-sm">
                <p className="font-semibold text-zinc-900">{selected.name}</p>
                <p className="text-xs text-zinc-600">
                  IČO {selected.ico}
                  {selected.city ? ` · ${selected.city}` : ''}
                </p>
                {selected.aresSource ? (
                  <p className="mt-1 text-xs text-amber-800">
                    Profil vytvořen z veřejných rejstříkových údajů. Není automaticky ověřenou firmou.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-orange-700 hover:underline"
                  onClick={() => setStep('company')}
                >
                  Změnit firmu
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, rating: n }))}
                    className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm ${
                      form.rating === n ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-zinc-200'
                    }`}
                  >
                    <Star className={`size-4 ${form.rating >= n ? 'fill-orange-500 text-orange-500' : 'text-zinc-300'}`} />
                    {n}
                  </button>
                ))}
              </div>

              <select
                value={form.sentiment}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    sentiment: e.target.value as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL',
                  }))
                }
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
              >
                <option value="POSITIVE">Pozitivní zkušenost</option>
                <option value="NEUTRAL">Neutrální</option>
                <option value="NEGATIVE">Negativní zkušenost</option>
              </select>

              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Nadpis (volitelně)"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
              />

              <textarea
                required
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Text recenze *"
                rows={5}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
              />

              <input
                required
                type="email"
                value={form.authorEmail}
                onChange={(e) => setForm((f) => ({ ...f, authorEmail: e.target.value }))}
                placeholder="Váš email * (nebude zveřejněn)"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
              />

              <input
                value={form.authorDisplayName}
                onChange={(e) => setForm((f) => ({ ...f, authorDisplayName: e.target.value }))}
                placeholder="Jméno / přezdívka (veřejné)"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
              />

              {!selected.verifiedBusinessEmail ? (
                <input
                  value={form.submittedBusinessEmail}
                  onChange={(e) => setForm((f) => ({ ...f, submittedBusinessEmail: e.target.value }))}
                  placeholder="Znáte kontaktní email firmy? (volitelné)"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
                />
              ) : null}

              <CompanyReviewMediaUpload
                images={reviewMedia.images}
                videos={reviewMedia.videos}
                onChange={setReviewMedia}
                disabled={submitting}
              />

              <label className="flex items-start gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={form.confirmedExperience}
                  onChange={(e) => setForm((f) => ({ ...f, confirmedExperience: e.target.checked }))}
                  className="mt-0.5"
                />
                Potvrzuji, že recenze vychází z mé skutečné zkušenosti s touto firmou.
              </label>
            </form>
          ) : null}

          {step === 'done' ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">Recenze odeslána</p>
              <p className="mt-2">{successMsg}</p>
              <p className="mt-2 text-xs">
                Po ověření emailu bude recenze zveřejněna na profilu firmy a jako příspěvek v komunitě.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {step === 'form' ? (
          <div className="sticky bottom-0 border-t border-zinc-100 bg-white px-4 py-3 sm:px-5">
            <button
              type="submit"
              form="company-review-form"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Odesílám…
                </>
              ) : (
                'Odeslat recenzi'
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
