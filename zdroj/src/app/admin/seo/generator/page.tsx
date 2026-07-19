'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const INTENTS = [
  'prodej-domu',
  'prodej-bytu',
  'pronajem-bytu',
  'prodej-pozemku',
  'prodej-chaty',
  'prodej-garaze',
  'prodej-komercnich-prostor',
] as const;

export default function AdminSeoGeneratorPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [intentSlug, setIntentSlug] = useState<(typeof INTENTS)[number]>('prodej-domu');
  const [locationSlug, setLocationSlug] = useState('pardubice');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '')}/admin/seo/content/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ intentSlug, locationSlug, useAi: true }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      setMsg(err.message ?? `Chyba ${res.status}`);
      return;
    }
    setMsg('Návrh SEO obsahu vytvořen — zkontrolujte v seznamu a schvalte.');
  }, [token, intentSlug, locationSlug]);

  if (!isLoading && (!token || user?.role !== 'ADMIN')) {
    router.replace('/');
    return null;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/seo" className="text-sm text-zinc-500 hover:underline">
        ← SEO nastavení
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">SEO generátor</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Workflow: Návrh → Kontrola → Schválení → Publikace. AI nevymýšlí statistiky ani fakta —
        generuje pouze šablonový text z ověřených dat.
      </p>

      <section className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div>
          <label className="mb-1 block text-sm font-medium">Intent</label>
          <select
            value={intentSlug}
            onChange={(e) => setIntentSlug(e.target.value as (typeof INTENTS)[number])}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            {INTENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Slug lokality</label>
          <input
            value={locationSlug}
            onChange={(e) => setLocationSlug(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="pardubice"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Generuji…' : 'Vygenerovat návrh'}
        </button>
        {msg ? <p className="text-sm text-zinc-700">{msg}</p> : null}
      </section>
    </main>
  );
}
