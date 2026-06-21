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

type FormState = {
  leadPriceClassic: string;
  leadPriceShorts: string;
  leadPriceDeveloper: string;
  leadPriceCompany: string;
  tipPortalPercent: string;
  tipTipsterPercent: string;
  tipMinContactPrice: string;
  tipMaxContactPrice: string;
  tipSuccessBonus: string;
};

export default function AdminContactMonetizationPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [form, setForm] = useState<FormState>({
    leadPriceClassic: '50',
    leadPriceShorts: '50',
    leadPriceDeveloper: '50',
    leadPriceCompany: '50',
    tipPortalPercent: '30',
    tipTipsterPercent: '70',
    tipMinContactPrice: '0',
    tipMaxContactPrice: '10000',
    tipSuccessBonus: '0',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySettings = useCallback((s: ContactMonetizationSettingsDto) => {
    setForm({
      leadPriceClassic: String(s.leadPriceClassic ?? s.ownerListingContactPrice ?? 50),
      leadPriceShorts: String(s.leadPriceShorts ?? 50),
      leadPriceDeveloper: String(s.leadPriceDeveloper ?? 50),
      leadPriceCompany: String(s.leadPriceCompany ?? 50),
      tipPortalPercent: String(s.tipPortalPercent),
      tipTipsterPercent: String(s.tipTipsterPercent),
      tipMinContactPrice: String(s.tipMinContactPrice ?? 0),
      tipMaxContactPrice: String(s.tipMaxContactPrice ?? 10000),
      tipSuccessBonus: String(s.tipSuccessBonus ?? 0),
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

    const payload = {
      leadPriceClassic: Number(form.leadPriceClassic),
      leadPriceShorts: Number(form.leadPriceShorts),
      leadPriceDeveloper: Number(form.leadPriceDeveloper),
      leadPriceCompany: Number(form.leadPriceCompany),
      tipPortalPercent: Number(form.tipPortalPercent),
      tipTipsterPercent: Number(form.tipTipsterPercent),
      tipMinContactPrice: Number(form.tipMinContactPrice),
      tipMaxContactPrice: Number(form.tipMaxContactPrice),
      tipSuccessBonus: Number(form.tipSuccessBonus),
      ownerListingContactPrice: Number(form.leadPriceClassic),
    };

    if (Object.values(payload).some((v) => !Number.isFinite(v))) {
      setSaving(false);
      setError('Zadejte platná čísla.');
      return;
    }

    const r = await nestAdminContactMonetizationUpdate(token, payload);
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
        Oddělené nastavení tarifů leadů pro inzerenty a tipařského systému.
      </p>

      <form onSubmit={onSave} className="mt-6 space-y-6">
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">A) Tarify leadů pro inzerenty</h2>
          <p className="text-xs text-zinc-500">
            Zájemce neplatí — kredit se strhne inzerentovi při odemčení leadu.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['leadPriceClassic', 'Klasik (Kč)'],
                ['leadPriceShorts', 'Shorts (Kč)'],
                ['leadPriceDeveloper', 'Developerský projekt (Kč)'],
                ['leadPriceCompany', 'Firemní nabídka (Kč)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 block font-medium">{label}</span>
                <input
                  type="number"
                  min={0}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">B) Tipařský systém</h2>
          <p className="text-xs text-zinc-500">Součet provizí portálu a tipaře musí být 100 %.</p>
          <div className="grid gap-3 sm:grid-cols-2">
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
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Min. cena kontaktu (Kč)</span>
              <input
                type="number"
                min={0}
                value={form.tipMinContactPrice}
                onChange={(e) => setForm((f) => ({ ...f, tipMinContactPrice: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Max. cena kontaktu (Kč)</span>
              <input
                type="number"
                min={0}
                value={form.tipMaxContactPrice}
                onChange={(e) => setForm((f) => ({ ...f, tipMaxContactPrice: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="col-span-full block text-sm">
              <span className="mb-1 block font-medium">Bonus za úspěšný tip (Kč)</span>
              <input
                type="number"
                min={0}
                value={form.tipSuccessBonus}
                onChange={(e) => setForm((f) => ({ ...f, tipSuccessBonus: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
          </div>
        </section>

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
