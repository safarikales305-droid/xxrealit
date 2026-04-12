'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PropertyGrid } from '@/components/property-grid';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestFetchBrokerBySlug,
  nestUpsertBrokerReview,
  type NestBrokerPublicDetail,
} from '@/lib/nest-client';
import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';

function StarsRow({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <div className="flex items-center gap-2 text-2xl text-amber-500" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < full ? '★' : '☆'}</span>
      ))}
    </div>
  );
}

export default function MaklerPublicPage() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const { apiAccessToken, isAuthenticated } = useAuth();
  const [data, setData] = useState<NestBrokerPublicDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [ratingDraft, setRatingDraft] = useState(5);
  const [textDraft, setTextDraft] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewErr, setReviewErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug.trim()) return;
    setLoadErr(null);
    const d = await nestFetchBrokerBySlug(slug, apiAccessToken);
    if (!d) {
      setLoadErr('Profil nebyl nalezen nebo není veřejný.');
      setData(null);
      return;
    }
    setData(d);
    if (d.myReview) {
      setRatingDraft(d.myReview.rating);
      setTextDraft(d.myReview.reviewText ?? '');
    } else {
      setRatingDraft(5);
      setTextDraft('');
    }
  }, [slug, apiAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const b = data?.broker;
  const avatar =
    b?.avatarUrl && b.avatarUrl.trim()
      ? /^https?:\/\//i.test(b.avatarUrl)
        ? b.avatarUrl
        : nestAbsoluteAssetUrl(b.avatarUrl) || b.avatarUrl
      : null;
  const cover =
    b?.coverImageUrl && b.coverImageUrl.trim()
      ? /^https?:\/\//i.test(b.coverImageUrl)
        ? b.coverImageUrl
        : nestAbsoluteAssetUrl(b.coverImageUrl) || b.coverImageUrl
      : null;

  const listings: PropertyFeedItem[] = [];
  if (data?.listings && Array.isArray(data.listings)) {
    for (const row of data.listings) {
      const n = safeNormalizePropertyFromApi(row);
      if (n) listings.push(n);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-20 text-zinc-900">
      <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
        <Link href="/makleri" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Makléři
        </Link>
      </div>

      {loadErr || !b ? (
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <p className="text-center text-sm text-zinc-600">
            {loadErr ?? 'Načítám…'}
          </p>
        </div>
      ) : (
        <>
          <div className="relative mx-auto mt-4 max-w-4xl overflow-hidden rounded-b-2xl sm:px-6">
            <div className="relative aspect-[21/9] min-h-[120px] w-full bg-zinc-200 sm:rounded-2xl">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-rose-400 to-violet-700" />
              )}
            </div>
            <div className="relative mx-auto -mt-14 max-w-3xl px-4 sm:px-0">
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
                  <div className="size-24 shrink-0 overflow-hidden rounded-full border-4 border-white bg-zinc-100 shadow-md sm:size-28">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-2xl font-semibold text-zinc-400">
                        {(b.name ?? '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="text-center sm:text-left">
                    <h1 className="text-xl font-bold sm:text-2xl">{b.name ?? 'Makléř'}</h1>
                    {b.officeName ? (
                      <p className="mt-1 text-sm font-medium text-zinc-600">{b.officeName}</p>
                    ) : null}
                    {b.regionLabel ? (
                      <p className="mt-1 text-xs text-zinc-500">{b.regionLabel}</p>
                    ) : null}
                    {b.specialization ? (
                      <p className="mt-2 text-xs text-zinc-600">{b.specialization}</p>
                    ) : null}
                    {b.allowBrokerReviews &&
                    b.ratingAverage != null &&
                    b.ratingCount != null &&
                    b.ratingCount > 0 ? (
                      <div className="mt-3 flex flex-col items-center gap-1 sm:items-start">
                        <StarsRow value={b.ratingAverage} />
                        <p className="text-xs text-zinc-600">
                          {b.ratingAverage.toFixed(1)} z 5 · {b.ratingCount}{' '}
                          {b.ratingCount === 1 ? 'recenze' : b.ratingCount < 5 ? 'recenze' : 'recenzí'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                  {b.web?.trim() ? (
                    <a
                      href={b.web.startsWith('http') ? b.web : `https://${b.web}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-center text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      Web
                    </a>
                  ) : null}
                  {b.phonePublic?.trim() ? (
                    <a
                      href={`tel:${b.phonePublic.replace(/\s+/g, '')}`}
                      className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-center text-sm font-bold text-white shadow-md"
                    >
                      Zavolat
                    </a>
                  ) : null}
                  {b.emailPublic?.trim() ? (
                    <a
                      href={`mailto:${b.emailPublic}`}
                      className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-center text-sm font-semibold text-orange-900"
                    >
                      E-mail
                    </a>
                  ) : null}
                  <Link
                    href={isAuthenticated ? '/profil/zpravy' : '/login'}
                    className="rounded-full border border-zinc-300 bg-zinc-50 px-4 py-2 text-center text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
                  >
                    Interní zprávy (schránka)
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-3xl px-4 sm:px-6">
            {b.bio?.trim() ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  O mně
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                  {b.bio}
                </p>
              </section>
            ) : null}

            <section className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-900">Aktivní inzeráty</h2>
              {listings.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600">Zatím žádné veřejné inzeráty.</p>
              ) : (
                <div className="mt-4">
                  <PropertyGrid properties={listings} />
                </div>
              )}
            </section>

            {b.allowBrokerReviews ? (
              <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-900">Hodnocení a recenze</h2>
                {!isAuthenticated ? (
                  <p className="mt-3 text-sm text-zinc-600">
                    Pro napsání recenze se{' '}
                    <Link href="/login" className="font-semibold text-[#e85d00] hover:underline">
                      přihlaste
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
                    <p className="text-sm font-medium text-zinc-800">
                      {data?.myReview ? 'Upravit vaši recenzi' : 'Přidat recenzi'}
                    </p>
                    <label className="mt-3 block text-xs font-semibold text-zinc-600">
                      Hvězdičky (1–5)
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={ratingDraft}
                        onChange={(e) => setRatingDraft(Number(e.target.value))}
                        className="mt-1 block w-full accent-orange-500"
                      />
                      <span className="text-lg text-amber-500">{'★'.repeat(ratingDraft)}</span>
                    </label>
                    <label className="mt-3 block text-xs font-semibold text-zinc-600">
                      Text (volitelný; pokud vyplníte, min. 10 znaků, max. 2000)
                      <textarea
                        value={textDraft}
                        onChange={(e) => setTextDraft(e.target.value)}
                        rows={4}
                        maxLength={2000}
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="Jak probíhala spolupráce?"
                      />
                    </label>
                    {reviewErr ? <p className="mt-2 text-sm text-red-600">{reviewErr}</p> : null}
                    <button
                      type="button"
                      disabled={reviewSaving}
                      className="mt-3 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      onClick={() => {
                        setReviewErr(null);
                        const t = textDraft.trim();
                        if (t.length > 0 && t.length < 10) {
                          setReviewErr('Text musí mít alespoň 10 znaků, nebo ho nechte prázdný.');
                          return;
                        }
                        setReviewSaving(true);
                        void nestUpsertBrokerReview(apiAccessToken, b.id, {
                          rating: ratingDraft,
                          reviewText: t.length ? t : undefined,
                        }).then((r) => {
                          setReviewSaving(false);
                          if (!r.ok) {
                            setReviewErr(r.error ?? 'Uložení se nezdařilo.');
                            return;
                          }
                          void load();
                        });
                      }}
                    >
                      {reviewSaving ? 'Ukládám…' : 'Odeslat recenzi'}
                    </button>
                  </div>
                )}

                <div className="mt-6 space-y-4">
                  {data?.reviews?.length ? (
                    data.reviews.map((rev) => {
                      const aimg =
                        rev.author.avatar?.trim() &&
                        (/^https?:\/\//i.test(rev.author.avatar)
                          ? rev.author.avatar
                          : nestAbsoluteAssetUrl(rev.author.avatar) || rev.author.avatar);
                      return (
                        <article
                          key={rev.id}
                          className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="size-10 shrink-0 overflow-hidden rounded-full bg-zinc-200">
                              {aimg ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={aimg} alt="" className="size-full object-cover" />
                              ) : (
                                <div className="flex size-full items-center justify-center text-xs font-bold text-zinc-500">
                                  {(rev.author.name ?? 'U').charAt(0)}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-zinc-900">
                                {rev.author.name?.trim() || 'Uživatel'}
                              </p>
                              <p className="text-amber-500">
                                {'★'.repeat(rev.rating)}
                                {'☆'.repeat(5 - rev.rating)}
                              </p>
                              {rev.reviewText?.trim() ? (
                                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
                                  {rev.reviewText}
                                </p>
                              ) : null}
                              <p className="mt-2 text-xs text-zinc-400">
                                {new Date(rev.createdAt).toLocaleString('cs-CZ')}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-10 text-center text-sm text-zinc-500">
                      Zatím žádné recenze — buďte první.
                    </div>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
