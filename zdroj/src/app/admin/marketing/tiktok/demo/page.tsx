'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestTikTokCreateJob,
  nestTikTokDemoListings,
  nestTikTokListingStatus,
  nestTikTokStatus,
  type TikTokConnectionStatus,
} from '@/lib/tiktok-admin-api';

export default function AdminTikTokDemoPage() {
  const { user, apiAccessToken, isLoading } = useAuth();
  const [status, setStatus] = useState<TikTokConnectionStatus | null>(null);
  const [listings, setListings] = useState<
    Array<{ id: string; title: string; city: string; propertyType: string; offerType: string }>
  >([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [apiLog, setApiLog] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!apiAccessToken) return;
    const [st, items] = await Promise.all([
      nestTikTokStatus(apiAccessToken),
      nestTikTokDemoListings(apiAccessToken),
    ]);
    setStatus(st);
    setListings(items);
    if (items[0] && !selectedId) setSelectedId(items[0].id);
  }, [apiAccessToken, selectedId]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') return;
    void load();
  }, [user, isLoading, load]);

  async function publishDemo() {
    if (!apiAccessToken || !selectedId) return;
    setBusy(true);
    setResult(null);
    setApiLog(null);
    const r = await nestTikTokCreateJob(apiAccessToken, selectedId);
    if (!r?.ok) {
      setResult('Publikování selhalo.');
      setBusy(false);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const listingStatus = await nestTikTokListingStatus(apiAccessToken, selectedId);
    setApiLog(listingStatus);
    const latest = listingStatus?.jobs?.[0];
    setResult(
      latest?.status === 'UPLOADED'
        ? latest.isDraftInbox
          ? 'Video bylo odesláno do TikTok inboxu (draft).'
          : 'Video bylo úspěšně odesláno na TikTok.'
        : `Stav jobu: ${latest?.status ?? 'neznámý'}${latest?.errorMessage ? ` — ${latest.errorMessage}` : ''}`,
    );
    setBusy(false);
  }

  if (isLoading) return <p className="p-6 text-sm text-gray-500">Načítání…</p>;
  if (!user || user.role !== 'ADMIN') {
    return <p className="p-6 text-sm text-red-600">Přístup pouze pro administrátory.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">TikTok — Demo pro recenzi</h1>
          <p className="mt-1 text-sm text-gray-600">
            Stránka pro natočení demo videa pro TikTok App Review.
          </p>
        </div>
        <Link href="/admin/marketing/tiktok" className="text-sm text-orange-600 underline">
          ← Zpět na TikTok
        </Link>
      </div>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">1. Propojení účtu</h2>
        <p className="mt-2 text-sm">
          Stav: {status?.connected ? `✓ ${status.accountName ?? 'Propojeno'}` : 'Nepropojeno'}
        </p>
        {!status?.connected && (
          <a
            href="/api/tiktok/auth"
            className="mt-3 inline-block rounded-lg bg-black px-4 py-2 text-sm text-white"
          >
            Připojit TikTok
          </a>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">2. Vyberte inzerát s videem</h2>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
        >
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title} — {l.city} ({l.offerType} {l.propertyType})
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">3. Publikovat na TikTok</h2>
        <button
          type="button"
          disabled={busy || !status?.connected || !selectedId}
          onClick={() => void publishDemo()}
          className="mt-3 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Publikuji…' : 'Publikovat na TikTok'}
        </button>
        {result && <p className="mt-3 text-sm text-green-800">{result}</p>}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">4. Log API odpovědi</h2>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
          {apiLog ? JSON.stringify(apiLog, null, 2) : 'Po publikování zde uvidíte odpověď API.'}
        </pre>
      </section>

      <section className="rounded-xl border border-orange-200 bg-orange-50 p-5 text-sm">
        <h2 className="font-semibold text-orange-900">Jak natočit demo video</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-orange-950">
          <li>Přihlaste se jako admin na www.xxrealit.cz/admin/marketing/tiktok/demo</li>
          <li>Ukažte propojení TikTok účtu (tlačítko Připojit TikTok → OAuth → návrat)</li>
          <li>Vyberte inzerát s videem ze seznamu</li>
          <li>Klikněte Publikovat na TikTok a počkejte na výsledek</li>
          <li>Ukažte log API odpovědi a případně video v TikTok inboxu nebo na profilu</li>
        </ol>
      </section>
    </div>
  );
}
