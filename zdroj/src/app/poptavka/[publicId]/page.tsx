'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BeforeAfterSlider } from '@/components/ai-visualization/BeforeAfterSlider';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchPublicPoptavka,
  formatCzkRange,
  respondToRenovationPoptavka,
  type PublicPoptavkaView,
} from '@/lib/ai-visualization-client';

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nová',
  SENT: 'Rozeslána',
  COMPANIES_RESPONDING: 'Firmy reagují',
  OFFERS_RECEIVED: 'Nabídky přijaty',
  CLOSED: 'Uzavřena',
};

export default function PoptavkaPage() {
  const params = useParams();
  const publicId = typeof params.publicId === 'string' ? params.publicId : '';
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<PublicPoptavkaView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offerPrice, setOfferPrice] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [respondMsg, setRespondMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!publicId) return;
    void fetchPublicPoptavka(publicId).then((res) => {
      if ('message' in res) setError(res.message);
      else setData(res.data);
    });
  }, [publicId, isAuthenticated]);

  const respondingAs = data?.recipients.find((r) => r.canRespond);

  async function submitOffer(kind: 'INTERESTED' | 'NO_CAPACITY' | 'OFFER_SENT') {
    if (!respondingAs || !publicId) return;
    const res = await respondToRenovationPoptavka(publicId, {
      companyId: respondingAs.companyId,
      status: kind,
      offerPrice: kind === 'OFFER_SENT' && offerPrice ? Number(offerPrice.replace(/\s/g, '')) : undefined,
      offerMessage: offerMessage.trim() || undefined,
    });
    setRespondMsg('message' in res ? res.message : 'Odpověď byla odeslána.');
    if (!('message' in res)) {
      const refreshed = await fetchPublicPoptavka(publicId);
      if (!('message' in refreshed)) setData(refreshed.data);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="text-center text-zinc-600">Načítám poptávku…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-zinc-900">Poptávka rekonstrukce</h1>
      <p className="mt-1 text-sm text-zinc-600">Stav: {STATUS_LABEL[data.status] ?? data.status}</p>

      {data.originalPreviewUrl && data.resultPreviewUrl ? (
        <div className="mt-6">
          <BeforeAfterSlider beforeUrl={data.originalPreviewUrl} afterUrl={data.resultPreviewUrl} />
        </div>
      ) : null}

      <dl className="mt-6 space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
        {data.location ? (
          <>
            <dt className="font-semibold text-zinc-800">Lokalita</dt>
            <dd className="text-zinc-700">{data.location}</dd>
          </>
        ) : null}
        {data.areaSqm ? (
          <>
            <dt className="mt-2 font-semibold text-zinc-800">Plocha</dt>
            <dd className="text-zinc-700">{data.areaSqm} m²</dd>
          </>
        ) : null}
        {data.style ? (
          <>
            <dt className="mt-2 font-semibold text-zinc-800">Styl</dt>
            <dd className="text-zinc-700">{data.style}</dd>
          </>
        ) : null}
        {data.budgetMin != null && data.budgetMax != null ? (
          <>
            <dt className="mt-2 font-semibold text-zinc-800">AI orientační rozpočet</dt>
            <dd className="font-bold text-orange-700">{formatCzkRange(data.budgetMin, data.budgetMax)}</dd>
          </>
        ) : null}
        {data.contactEmail ? (
          <>
            <dt className="mt-2 font-semibold text-zinc-800">Kontakt</dt>
            <dd className="text-zinc-700">{data.contactEmail}</dd>
          </>
        ) : null}
      </dl>

      {data.lineItems?.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-bold text-zinc-900">Položkový AI odhad</p>
          <ul className="mt-2 divide-y divide-zinc-100 text-sm">
            {data.lineItems.map((line) => (
              <li key={line.id} className="flex justify-between gap-2 py-2">
                <span>{line.label}</span>
                <span className="font-semibold">{formatCzkRange(line.amountMin, line.amountMax)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {respondingAs ? (
        <div className="mt-8 rounded-2xl border-2 border-orange-200 bg-orange-50 p-4">
          <p className="font-bold text-zinc-900">Reakce firmy {respondingAs.companyName}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submitOffer('INTERESTED')}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
            >
              ✓ Mám zájem
            </button>
            <button
              type="button"
              onClick={() => void submitOffer('NO_CAPACITY')}
              className="rounded-xl bg-zinc-600 px-4 py-2 text-sm font-bold text-white"
            >
              ✕ Nemám kapacitu
            </button>
          </div>
          <p className="mt-4 text-sm font-semibold">Nabídnout cenu</p>
          <input
            value={offerPrice}
            onChange={(e) => setOfferPrice(e.target.value)}
            placeholder="Cena v Kč"
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          />
          <textarea
            value={offerMessage}
            onChange={(e) => setOfferMessage(e.target.value)}
            rows={3}
            placeholder="Zpráva"
            className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void submitOffer('OFFER_SENT')}
            className="mt-3 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white"
          >
            Odeslat nabídku
          </button>
          {respondMsg ? <p className="mt-2 text-sm text-zinc-700">{respondMsg}</p> : null}
        </div>
      ) : null}
    </main>
  );
}
