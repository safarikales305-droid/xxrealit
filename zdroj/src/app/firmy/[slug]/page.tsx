'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, MapPin, Star } from 'lucide-react';
import { PublicHeader } from '@/components/navigation/PublicHeader';
import {
  CompanyReviewMediaUpload,
  type ReviewMediaItem,
} from '@/components/company-directory/CompanyReviewMediaUpload';
import {
  nestGetCompanyBySlug,
  nestGetCompanyReviews,
  nestSubmitCompanyClaim,
  nestSubmitCompanyReview,
  nestSubmitCompanyLead,
  nestTrackCompanyEvent,
  type CompanyDirectoryDetailResponse,
} from '@/lib/company-directory-client';

type ReviewItem = {
  id: string;
  rating: number;
  sentiment: string;
  title?: string;
  body: string;
  authorDisplayName: string;
  publishedAt?: string | null;
  media?: Array<{ type: string; url: string; thumbnailUrl?: string | null }>;
  response?: { body: string; verifiedCompanyResponse: boolean; createdAt: string } | null;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} z 5`}>
      {'★'.repeat(rating)}
      <span className="text-zinc-300">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export default function FirmaDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [data, setData] = useState<CompanyDirectoryDetailResponse | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewSummary, setReviewSummary] = useState<{ average: number | null; count: number }>({
    average: null,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [claimOpen, setClaimOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadMsg, setLeadMsg] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
    consent: false,
  });
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState({
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    ico: '',
  });
  const [reviewMedia, setReviewMedia] = useState<{ images: ReviewMediaItem[]; videos: ReviewMediaItem[] }>({
    images: [],
    videos: [],
  });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    sentiment: 'POSITIVE' as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL',
    title: '',
    body: '',
    authorEmail: '',
    authorDisplayName: '',
    submittedBusinessEmail: '',
    confirmedExperience: false,
  });

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    void Promise.all([nestGetCompanyBySlug(slug), nestGetCompanyReviews(slug)]).then(
      ([detail, rev]) => {
        setData(detail);
        if (rev) {
          setReviews(rev.items as ReviewItem[]);
          setReviewSummary(rev.summary);
        }
        setLoading(false);
      },
    );
  }, [slug]);

  const company = data?.company;
  const googleRating = data?.googleRating ?? company?.googleRating ?? company?.rating;
  const googleReviewCount = data?.googleReviewCount ?? company?.googleReviewCount ?? company?.ratingCount;
  const googleMapsUri = data?.googleMapsUri ?? company?.googleMapsUri;

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    const res = await nestSubmitCompanyLead({
      companyId: company.id,
      ...leadForm,
    });
    setLeadMsg(
      res?.id
        ? 'Váš zájem byl odeslán. Firma vás může kontaktovat, pokud má aktivní profil.'
        : res?.error ?? 'Odeslání se nezdařilo.',
    );
    if (res?.id) setLeadOpen(false);
  }

  function trackClick(type: 'WEBSITE_CLICK' | 'PHONE_CLICK' | 'EMAIL_CLICK') {
    if (!company) return;
    void nestTrackCompanyEvent({ companyId: company.id, type });
  }

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    const res = await nestSubmitCompanyClaim({
      slug: company.slug,
      companyId: company.id,
      ico: claimForm.ico,
      contactName: claimForm.contactName,
      contactEmail: claimForm.contactEmail,
      contactPhone: claimForm.contactPhone || undefined,
    });
    setClaimMsg(
      res
        ? 'Žádost o převzetí profilu byla odeslána. Ozveme se po ověření.'
        : 'Odeslání žádosti se nezdařilo. Zkontrolujte údaje.',
    );
    if (res) setClaimOpen(false);
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!company || submittingReview) return;
    setSubmittingReview(true);
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
      companySlug: company.slug,
      companyId: company.id,
      rating: reviewForm.rating,
      sentiment: reviewForm.sentiment,
      title: reviewForm.title || undefined,
      body: reviewForm.body,
      authorEmail: reviewForm.authorEmail,
      authorDisplayName: reviewForm.authorDisplayName || undefined,
      submittedBusinessEmail: reviewForm.submittedBusinessEmail || undefined,
      confirmedExperience: reviewForm.confirmedExperience,
      media: media.length > 0 ? media : undefined,
    });
    setSubmittingReview(false);
    if (res.error) {
      setReviewMsg(
        res.code ? `Recenzi se nepodařilo uložit. (${res.code}: ${res.error})` : res.error,
      );
    } else {
      setReviewMsg(
        res.message ??
          (res.emailVerificationRequired
            ? 'Recenze byla uložena. Na váš email jsme poslali ověřovací odkaz.'
            : 'Recenze odeslána. Zkontrolujte email pro ověření.'),
      );
      setReviewOpen(false);
      setReviewMedia({ images: [], videos: [] });
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-500">Načítám profil firmy…</div>
    );
  }

  if (!company) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-red-600">Firemní profil nebyl nalezen.</p>
        <Link href="/firmy" className="mt-4 inline-block text-sm font-semibold text-orange-700">
          ← Zpět na katalog
        </Link>
      </div>
    );
  }

  const xxAvg = reviewSummary.average ?? company.xxrealitRatingAverage;
  const xxCount = reviewSummary.count ?? company.xxrealitReviewCount ?? 0;

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16">
      <PublicHeader activeSection="profiles" />
      <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        <Link href="/profesionalove" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Lidé a firmy
        </Link>

        <article className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <Building2 className="size-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-zinc-900">{company.name}</h1>
              <p className="mt-1 text-sm text-zinc-600">
                IČO: {company.ico}
                {company.city ? ` · ${company.city}` : ''}
              </p>
              <p className="mt-1 text-sm text-zinc-500">{company.categoryLabel}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {company.badges.map((b) => (
              <span
                key={b}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700"
              >
                {b}
              </span>
            ))}
          </div>

          <section className="mt-6 grid gap-4 sm:grid-cols-2" id="hodnoceni">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Google hodnocení</h2>
              {googleRating != null ? (
                <>
                  <p className="mt-2 text-2xl font-bold text-zinc-900">
                    {googleRating.toFixed(1)} <Star className="inline size-5 fill-amber-400 text-amber-400" />
                  </p>
                  <p className="text-xs text-zinc-600">
                    {googleReviewCount ?? 0} hodnocení
                    {googleMapsUri ? (
                      <>
                        {' '}
                        ·{' '}
                        <a
                          href={googleMapsUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-700 hover:underline"
                        >
                          Google Maps
                        </a>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Vybrané recenze dostupné prostřednictvím Google
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">Google hodnocení zatím není dostupné.</p>
              )}
            </div>

            <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Hodnocení uživatelů XXREALIT</h2>
              {xxCount > 0 && xxAvg != null ? (
                <>
                  <p className="mt-2 text-2xl font-bold text-zinc-900">
                    {xxAvg.toFixed(1)} / 5
                  </p>
                  <p className="text-xs text-zinc-600">{xxCount} ověřených recenzí</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">Zatím bez recenzí na XXREALIT.</p>
              )}
            </div>
          </section>

          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
            {company.registryDisclaimer ??
              'Profil vytvořen z veřejných rejstříkových údajů. Není automaticky partnerem XXREALIT.'}
          </p>

          <section className="mt-6 space-y-3 text-sm text-zinc-700">
            <h2 className="text-base font-semibold text-zinc-900">O firmě / ARES údaje</h2>
            {company.registeredAddress ? (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                {company.registeredAddress}
              </p>
            ) : null}
            {company.categories?.length ? (
              <p>Obory: {company.categories.map((c) => c.label).join(', ')}</p>
            ) : null}
          </section>

          {(company.website || company.phone || company.email) && (
            <section className="mt-6">
              <h2 className="text-base font-semibold text-zinc-900">Kontakty</h2>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                {company.website ? (
                  <li>
                    Web:{' '}
                    <a
                      href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-700 hover:underline"
                      onClick={() => trackClick('WEBSITE_CLICK')}
                    >
                      {company.website}
                    </a>
                  </li>
                ) : null}
                {company.phone ? (
                  <li>
                    Tel.:{' '}
                    <a
                      href={`tel:${company.phone.replace(/\s/g, '')}`}
                      className="text-orange-700 hover:underline"
                      onClick={() => trackClick('PHONE_CLICK')}
                    >
                      {company.phone}
                    </a>
                  </li>
                ) : null}
                {company.email ? (
                  <li>
                    E-mail:{' '}
                    <a
                      href={`mailto:${company.email}`}
                      className="text-orange-700 hover:underline"
                      onClick={() => trackClick('EMAIL_CLICK')}
                    >
                      {company.email}
                    </a>
                  </li>
                ) : null}
              </ul>
            </section>
          )}

          {company.profileStatus === 'UNCLAIMED' ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Jste z této firmy?{' '}
              <button
                type="button"
                onClick={() => setClaimOpen(true)}
                className="font-semibold text-orange-800 underline"
              >
                Převzít profil
              </button>
            </p>
          ) : (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Profil je spravován firmou.{' '}
              <span className="font-semibold">Spravovat profil</span> ·{' '}
              <span className="font-semibold">Přidat příspěvek</span>
            </p>
          )}

          <div className="mt-8 flex flex-col gap-2 sm:flex-row" id="prevzit-profil">
            <button
              type="button"
              onClick={() => setLeadOpen((v) => !v)}
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-3 text-sm font-semibold text-white"
            >
              Mám zájem
            </button>
            <button
              type="button"
              onClick={() => setReviewOpen((v) => !v)}
              className="rounded-full border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-800"
            >
              Napsat recenzi
            </button>
            {company.profileStatus === 'UNCLAIMED' ? (
              <button
                type="button"
                onClick={() => setClaimOpen((v) => !v)}
                className="rounded-full border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-800"
              >
                Převzít profil
              </button>
            ) : null}
          </div>

          {leadMsg ? <p className="mt-3 text-sm text-emerald-700">{leadMsg}</p> : null}
          {claimMsg ? <p className="mt-3 text-sm text-emerald-700">{claimMsg}</p> : null}

          {reviewOpen ? (
            <form
              onSubmit={(e) => void submitReview(e)}
              className="mt-4 space-y-3 rounded-xl border border-zinc-200 p-4"
              id="recenze"
            >
              <h3 className="font-semibold text-zinc-900">Nová recenze</h3>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReviewForm((f) => ({ ...f, rating: n }))}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      reviewForm.rating === n ? 'border-orange-500 bg-orange-50' : ''
                    }`}
                  >
                    {n} ★
                  </button>
                ))}
              </div>
              <select
                value={reviewForm.sentiment}
                onChange={(e) =>
                  setReviewForm((f) => ({
                    ...f,
                    sentiment: e.target.value as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL',
                  }))
                }
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="POSITIVE">Pozitivní zkušenost</option>
                <option value="NEUTRAL">Neutrální</option>
                <option value="NEGATIVE">Negativní zkušenost</option>
              </select>
              <input
                value={reviewForm.title}
                onChange={(e) => setReviewForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Nadpis (volitelně)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <textarea
                required
                value={reviewForm.body}
                onChange={(e) => setReviewForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Text recenze"
                rows={4}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                required
                type="email"
                value={reviewForm.authorEmail}
                onChange={(e) => setReviewForm((f) => ({ ...f, authorEmail: e.target.value }))}
                placeholder="Váš email (povinný, nebude zveřejněn)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={reviewForm.authorDisplayName}
                onChange={(e) =>
                  setReviewForm((f) => ({ ...f, authorDisplayName: e.target.value }))
                }
                placeholder="Jméno / přezdívka (veřejné)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={reviewForm.submittedBusinessEmail}
                onChange={(e) =>
                  setReviewForm((f) => ({ ...f, submittedBusinessEmail: e.target.value }))
                }
                placeholder="Znáte veřejný kontaktní email firmy? (volitelné)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <label className="flex items-start gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={reviewForm.confirmedExperience}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, confirmedExperience: e.target.checked }))
                  }
                  className="mt-0.5"
                />
                Potvrzuji, že recenze vychází z mé skutečné zkušenosti s touto firmou.
              </label>
              <CompanyReviewMediaUpload
                images={reviewMedia.images}
                videos={reviewMedia.videos}
                onChange={setReviewMedia}
                disabled={submittingReview}
              />
              <button
                type="submit"
                disabled={submittingReview}
                className="sticky bottom-2 w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              >
                {submittingReview ? 'Odesílám…' : 'Odeslat recenzi'}
              </button>
            </form>
          ) : null}

          {claimOpen ? (
            <form onSubmit={(e) => void submitClaim(e)} className="mt-4 space-y-3 rounded-xl border p-4">
              <input
                required
                value={claimForm.ico}
                onChange={(e) => setClaimForm((f) => ({ ...f, ico: e.target.value }))}
                placeholder="IČO"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                required
                value={claimForm.contactName}
                onChange={(e) => setClaimForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder="Jméno kontaktní osoby"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                required
                type="email"
                value={claimForm.contactEmail}
                onChange={(e) => setClaimForm((f) => ({ ...f, contactEmail: e.target.value }))}
                placeholder="Pracovní e-mail"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                Odeslat žádost
              </button>
            </form>
          ) : null}

          {leadOpen ? (
            <form
              onSubmit={(e) => void submitLead(e)}
              className="mt-4 space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-4"
              id="kontaktovat-firmu"
            >
              <h3 className="font-semibold text-zinc-900">Kontaktovat firmu</h3>
              <input
                required
                value={leadForm.name}
                onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jméno"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                required
                type="email"
                value={leadForm.email}
                onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="E-mail"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={leadForm.phone}
                onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Telefon (volitelné)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <textarea
                value={leadForm.message}
                onChange={(e) => setLeadForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Zpráva"
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <label className="flex items-start gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={leadForm.consent}
                  onChange={(e) => setLeadForm((f) => ({ ...f, consent: e.target.checked }))}
                  className="mt-0.5"
                />
                Souhlasím se sdílením kontaktních údajů s firmou za účelem odpovědi na můj dotaz.
              </label>
              <button
                type="submit"
                disabled={!leadForm.consent}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Odeslat zájem
              </button>
            </form>
          ) : null}
        </article>

        {reviews.length > 0 ? (
          <section className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Recenze na XXREALIT</h2>
            {reviews.map((r) => (
              <article key={r.id} id={`review-${r.id}`} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm scroll-mt-24">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-zinc-900">{r.authorDisplayName}</p>
                  <Stars rating={r.rating} />
                </div>
                {r.title ? <p className="mt-1 font-medium">{r.title}</p> : null}
                <p className="mt-2 text-zinc-700">{r.body}</p>
                {r.media && r.media.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {r.media.map((m, idx) =>
                      m.type === 'VIDEO' ? (
                        <video
                          key={`${r.id}-v-${idx}`}
                          src={m.url}
                          controls
                          playsInline
                          preload="metadata"
                          className="col-span-2 aspect-video w-full rounded-lg bg-black"
                        />
                      ) : (
                        <button
                          key={`${r.id}-i-${idx}`}
                          type="button"
                          onClick={() => setLightboxUrl(m.url)}
                          className="overflow-hidden rounded-lg border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.thumbnailUrl ?? m.url} alt="" className="aspect-square w-full object-cover" />
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
                {r.publishedAt ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    {new Date(r.publishedAt).toLocaleDateString('cs-CZ')}
                  </p>
                ) : null}
                {r.response ? (
                  <div className="mt-3 rounded-lg bg-zinc-50 p-3">
                    <p className="text-xs font-semibold uppercase text-zinc-500">Reakce firmy</p>
                    <p className="mt-1 text-zinc-700">{r.response.body}</p>
                    {r.response.verifiedCompanyResponse ? (
                      <span className="mt-1 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Ověřená reakce firmy
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}

        {lightboxUrl ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setLightboxUrl(null)}
            onKeyDown={() => setLightboxUrl(null)}
            role="button"
            tabIndex={0}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxUrl} alt="" className="max-h-[90vh] max-w-full rounded-lg object-contain" />
          </div>
        ) : null}

        {data?.similar?.length ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-900">Podobné firmy</h2>
            <ul className="mt-3 space-y-2">
              {data.similar.map((s) => (
                <li key={s.id}>
                  <Link
                    href={s.href}
                    className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:border-orange-200"
                  >
                    {s.name} · {s.categoryLabel}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
