'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestListAdvertiserLeads,
  nestUnlockPendingListingLeads,
  type AdvertiserListingLeadRow,
} from '@/lib/nest-client';

export default function ProfilLeadyPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;
  const [leads, setLeads] = useState<AdvertiserListingLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLeads(await nestListAdvertiserLeads(token));
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/prihlaseni?redirect=/profil/leady');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  const waitingCount = leads.filter((l) => l.status === 'WAITING_FOR_CREDIT').length;

  async function handleUnlockPending() {
    if (!token) return;
    setUnlockBusy(true);
    setMsg(null);
    setError(null);
    const r = await nestUnlockPendingListingLeads(token);
    setUnlockBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Odemčení se nezdařilo.');
      return;
    }
    setMsg(
      r.unlocked && r.unlocked > 0
        ? `Odemčeno ${r.unlocked} leadů.`
        : 'Žádné leady k odemčení — zkontrolujte kredit.',
    );
    void refresh();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/profil/dashboard" className="text-sm text-zinc-500 hover:underline">
            ← Profil
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Leady z inzerátů</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Zájemci o vaše běžné inzeráty. Kontakt se zobrazí po stržení kreditu dle tarifu.
          </p>
        </div>
        {waitingCount > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/profil/dashboard?tab=settings"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800"
            >
              Dobít kredit
            </Link>
            <button
              type="button"
              disabled={unlockBusy}
              onClick={() => void handleUnlockPending()}
              className="rounded-full bg-[#ff6a00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {unlockBusy ? 'Odemykám…' : 'Odemknout kontakty'}
            </button>
          </div>
        ) : null}
      </div>

      {msg ? <p className="mb-4 text-sm font-medium text-emerald-700">{msg}</p> : null}
      {error ? <p className="mb-4 text-sm font-medium text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Načítám leady…</p>
      ) : leads.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Zatím nemáte žádné leady z inzerátů.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b text-zinc-500">
                <th className="p-3">Inzerát</th>
                <th className="p-3">Zájemce</th>
                <th className="p-3">Kontakt</th>
                <th className="p-3">Stav</th>
                <th className="p-3">Datum</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-zinc-100 align-top">
                  <td className="p-3">
                    {lead.listingId ? (
                      <Link
                        href={`/nemovitost/${lead.listingId}`}
                        className="font-medium text-orange-700 hover:underline"
                      >
                        {lead.listingTitle ?? lead.listingId}
                      </Link>
                    ) : (
                      '—'
                    )}
                    {lead.listingCity ? (
                      <span className="mt-0.5 block text-xs text-zinc-500">{lead.listingCity}</span>
                    ) : null}
                  </td>
                  <td className="p-3 font-medium">{lead.buyerName}</td>
                  <td className="p-3">
                    {lead.status === 'WAITING_FOR_CREDIT' ? (
                      <div>
                        <span className="font-medium text-amber-800">Kontakt skrytý – dobijte kredit</span>
                        <span className="mt-1 block text-xs text-zinc-500">
                          Poplatek: {lead.leadPrice.toLocaleString('cs-CZ')} Kč
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {lead.buyerPhone ? <div>{lead.buyerPhone}</div> : null}
                        {lead.buyerEmail ? (
                          <div>
                            <a href={`mailto:${lead.buyerEmail}`} className="text-orange-700 hover:underline">
                              {lead.buyerEmail}
                            </a>
                          </div>
                        ) : null}
                        {lead.message ? (
                          <p className="text-xs text-zinc-600">{lead.message}</p>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {lead.status === 'WAITING_FOR_CREDIT' ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        Čeká na kredit
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                        Odemčeno
                      </span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap text-zinc-600">
                    {new Date(lead.createdAt).toLocaleString('cs-CZ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
