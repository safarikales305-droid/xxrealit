'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, MapPin } from 'lucide-react';
import {
  nestGetCompanyBySlug,
  nestSubmitCompanyClaim,
  type CompanyDirectoryDetailResponse,
} from '@/lib/company-directory-client';

export default function FirmaDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [data, setData] = useState<CompanyDirectoryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState({
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    ico: '',
  });

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    void nestGetCompanyBySlug(slug).then((res) => {
      setData(res);
      setLoading(false);
    });
  }, [slug]);

  const company = data?.company;

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

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-500">Načítám profil firmy…</div>;
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

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16">
      <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        <Link href="/firmy" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Registr firem
        </Link>

        <article className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <Building2 className="size-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-zinc-900">{company.name}</h1>
              <p className="mt-1 text-sm text-zinc-600">IČO: {company.ico}</p>
              {company.companyStatus ? (
                <p className="mt-1 text-xs text-zinc-500">Stav: {company.companyStatus}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {company.badges.map((b) => (
              <span key={b} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                {b}
              </span>
            ))}
          </div>

          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
            {company.registryDisclaimer ??
              'Profil vytvořen z veřejných rejstříkových údajů. Není automaticky partnerem XXREALIT.'}
          </p>

          <section className="mt-6 space-y-3 text-sm text-zinc-700">
            <h2 className="text-base font-semibold text-zinc-900">Údaje z veřejného registru</h2>
            {company.registeredAddress ? (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                {company.registeredAddress}
              </p>
            ) : null}
            {company.categories?.length ? (
              <p>
                Obory:{' '}
                {company.categories.map((c) => c.label).join(', ')}
              </p>
            ) : null}
            {company.aresLastSyncAt ? (
              <p className="text-xs text-zinc-500">
                Poslední synchronizace ARES: {new Date(company.aresLastSyncAt).toLocaleString('cs-CZ')}
              </p>
            ) : null}
          </section>

          {(company.website || company.phone || company.email) && (
            <section className="mt-6">
              <h2 className="text-base font-semibold text-zinc-900">Kontakt</h2>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                {company.website ? <li>Web: {company.website}</li> : null}
                {company.phone ? <li>Tel.: {company.phone}</li> : null}
                {company.email ? <li>E-mail: {company.email}</li> : null}
              </ul>
            </section>
          )}

          {company.rating != null ? (
            <section className="mt-6">
              <h2 className="text-base font-semibold text-zinc-900">Google hodnocení</h2>
              <p className="mt-1 text-sm text-zinc-700">
                {company.rating.toFixed(1)}
                {company.ratingCount != null ? ` (${company.ratingCount} hodnocení)` : ''}
              </p>
            </section>
          ) : (
            <p className="mt-6 text-sm text-zinc-500">Zatím bez hodnocení</p>
          )}

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setClaimOpen((v) => !v)}
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-3 text-sm font-semibold text-white"
            >
              Jste majitelem této firmy? Převzít profil
            </button>
            <button
              type="button"
              className="rounded-full border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-800"
            >
              Požádat o úpravu údajů
            </button>
          </div>

          {claimMsg ? <p className="mt-3 text-sm text-emerald-700">{claimMsg}</p> : null}

          {claimOpen ? (
            <form onSubmit={(e) => void submitClaim(e)} className="mt-4 space-y-3 rounded-xl border border-zinc-200 p-4">
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
              <input
                value={claimForm.contactPhone}
                onChange={(e) => setClaimForm((f) => ({ ...f, contactPhone: e.target.value }))}
                placeholder="Telefon"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                Odeslat žádost
              </button>
            </form>
          ) : null}
        </article>

        {data?.similar?.length ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-900">Podobné firmy</h2>
            <ul className="mt-3 space-y-2">
              {data.similar.map((s) => (
                <li key={s.id}>
                  <Link href={s.href} className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:border-orange-200">
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
