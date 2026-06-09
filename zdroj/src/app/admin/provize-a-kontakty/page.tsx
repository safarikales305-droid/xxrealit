'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminContactMonetizationGet,
  nestAdminContactMonetizationUpdate,
  type ContactMonetizationSettingsDto,
} from '@/lib/nest-client';

export default function AdminContactMonetizationPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [form, setForm] = useState({
    tipPortalPercent: '30',
    tipTipsterPercent: '70',
    ownerListingContactPrice: '50',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySettings = useCallback((s: ContactMonetizationSettingsDto) => {
    setForm({
      tipPortalPercent: String(s.tipPortalPercent),
      tipTipsterPercent: String(s.tipTipsterPercent),
      ownerListingContactPrice: String(s.ownerListingContactPrice),
    });
  }, []);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      setLoading(true);
      const s = await nestAdminContactMonetizationGet(token);
      setLoading(false);
      if (!s) {
        setError('Nepodařilo se načíst nastavení.');
        return;
      }
      applySettings(s);
    })();
  }, [token, applySettings]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setMsg(null);
    setError(null);
    const portal = Number(form.tipPortalPercent);
    const tipster = Number(form.tipTipsterPercent);
    const ownerPrice = Number(form.ownerListingContactPrice);
    if (!Number.isFinite(portal) || !Number.isFinite(tipster) || !Number.isFinite(ownerPrice)) {
      setSaving(false);
      setError('Zadejte platná čísla.');
      return;
    }
    const r = await nestAdminContactMonetizationUpdate(token, {
      tipPortalPercent: portal,
      tipTipsterPercent: tipster,
      ownerListingContactPrice: ownerPrice,
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení se nezdařilo.');
      return;
    }
    applySettings(r.settings);
    setMsg('Nastavení bylo uloženo.');
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 text-sm text-zinc-500">Načítám nastavení…</main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
          ← Administrace
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-zinc-900">Provize a kontakty</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Nastavení rozdělení kreditu při odemčení kontaktu u tipů a ceny leadu u vlastních inzerátů.
      </p>

      <form onSubmit={onSave} className="mt-6 space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <fieldset>
          <legend className="text-sm font-semibold text-zinc-900">Tipařské kontakty</legend>
          <p className="mt-1 text-xs text-zinc-500">Součet procent portálu a tipaře musí být 100 %.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Portál (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={form.tipPortalPercent}
                onChange={(e) => setForm((f) => ({ ...f, tipPortalPercent: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tipař (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={form.tipTipsterPercent}
                onChange={(e) => setForm((f) => ({ ...f, tipTipsterPercent: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-zinc-900">Cena kontaktu pro vlastní inzerát (Kč)</span>
          <span className="mb-2 block text-xs text-zinc-500">
            Zájemce neplatí — poplatek se strhne inzerentovi za lead.
          </span>
          <input
            type="number"
            min={0}
            value={form.ownerListingContactPrice}
            onChange={(e) => setForm((f) => ({ ...f, ownerListingContactPrice: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
          />
        </label>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {msg ? <p className="text-sm font-medium text-emerald-700">{msg}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Ukládám…' : 'Uložit nastavení'}
        </button>
      </form>
    </main>
  );
}
