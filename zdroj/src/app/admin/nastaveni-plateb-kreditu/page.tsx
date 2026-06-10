'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCreditSettingsGet,
  nestAdminCreditSettingsUpdate,
  type CreditTopUpSettingsDto,
} from '@/lib/nest-client';

export default function AdminCreditPaymentSettingsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [form, setForm] = useState({
    accountNumber: '',
    bankCode: '',
    recipientName: 'XXRealit',
    minAmount: '300',
    maxAmount: '100000',
    maxUnverifiedFirstTopUpAmount: '1000',
    paymentMessage: 'Dobiti kreditu XXRealit',
    confirmDeadlineDays: '2',
    allowUnverifiedFirstTopUp: true,
    allowPendingCreditSpending: false,
    allowPendingForInternalServices: false,
    allowBonusCreditOnListingContacts: true,
    allowBonusCreditOnTipContacts: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySettings = useCallback((s: CreditTopUpSettingsDto) => {
    setForm({
      accountNumber: s.accountNumber,
      bankCode: s.bankCode,
      recipientName: s.recipientName,
      minAmount: String(s.minAmount),
      maxAmount: String(s.maxAmount),
      paymentMessage: s.paymentMessage,
      confirmDeadlineDays: String(s.confirmDeadlineDays),
      maxUnverifiedFirstTopUpAmount: String(s.maxUnverifiedFirstTopUpAmount ?? 1000),
      allowUnverifiedFirstTopUp: s.allowUnverifiedFirstTopUp !== false,
      allowPendingCreditSpending: s.allowPendingCreditSpending === true,
      allowPendingForInternalServices: s.allowPendingForInternalServices === true,
      allowBonusCreditOnListingContacts: s.allowBonusCreditOnListingContacts !== false,
      allowBonusCreditOnTipContacts: s.allowBonusCreditOnTipContacts === true,
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
      const s = await nestAdminCreditSettingsGet(token);
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
    const r = await nestAdminCreditSettingsUpdate(token, {
      accountNumber: form.accountNumber.trim(),
      bankCode: form.bankCode.trim(),
      recipientName: form.recipientName.trim(),
      minAmount: Number(form.minAmount),
      maxAmount: Number(form.maxAmount),
      paymentMessage: form.paymentMessage.trim(),
      confirmDeadlineDays: Number(form.confirmDeadlineDays),
      maxUnverifiedFirstTopUpAmount: Number(form.maxUnverifiedFirstTopUpAmount),
      allowUnverifiedFirstTopUp: form.allowUnverifiedFirstTopUp,
      allowPendingCreditSpending: form.allowPendingCreditSpending,
      allowPendingForInternalServices: form.allowPendingForInternalServices,
      allowBonusCreditOnListingContacts: form.allowBonusCreditOnListingContacts,
      allowBonusCreditOnTipContacts: form.allowBonusCreditOnTipContacts,
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení selhalo.');
      return;
    }
    applySettings(r.settings);
    setMsg('Nastavení uloženo.');
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Nastavení plateb kreditu</h1>
          <p className="mt-1 text-sm text-zinc-600">Bankovní účet a limity pro QR dobití kreditu.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/dobiti-kreditu" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold hover:bg-zinc-50">
            Dobití kreditů
          </Link>
          <Link href="/admin" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold hover:bg-zinc-50">
            Admin
          </Link>
        </div>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Načítám…</p> : null}
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-green-700">{msg}</p> : null}

      <form onSubmit={(e) => void onSave(e)} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <div>
          <label className="mb-1 block text-sm font-semibold">Číslo účtu</label>
          <input
            value={form.accountNumber}
            onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
            placeholder="19-2000145399"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Kód banky</label>
          <input
            value={form.bankCode}
            onChange={(e) => setForm((f) => ({ ...f, bankCode: e.target.value }))}
            placeholder="0800"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Název příjemce</label>
          <input
            value={form.recipientName}
            onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-semibold">Minimum (Kč)</label>
            <input
              type="number"
              value={form.minAmount}
              onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Maximum (Kč)</label>
            <input
              type="number"
              value={form.maxAmount}
              onChange={(e) => setForm((f) => ({ ...f, maxAmount: e.target.value }))}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Zpráva pro platbu (QR MSG)</label>
          <input
            value={form.paymentMessage}
            onChange={(e) => setForm((f) => ({ ...f, paymentMessage: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Doba na potvrzení (dny)</label>
          <input
            type="number"
            min={1}
            max={30}
            value={form.confirmDeadlineDays}
            onChange={(e) => setForm((f) => ({ ...f, confirmDeadlineDays: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Max. první dobití neověřeného (Kč)</label>
          <input
            type="number"
            value={form.maxUnverifiedFirstTopUpAmount}
            onChange={(e) => setForm((f) => ({ ...f, maxUnverifiedFirstTopUpAmount: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.allowUnverifiedFirstTopUp}
              onChange={(e) => setForm((f) => ({ ...f, allowUnverifiedFirstTopUp: e.target.checked }))}
            />
            Povolit první dobití neověřeným uživatelům
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.allowPendingCreditSpending}
              onChange={(e) => setForm((f) => ({ ...f, allowPendingCreditSpending: e.target.checked }))}
            />
            Povolit použití čekajícího kreditu (pending)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.allowBonusCreditOnListingContacts}
              onChange={(e) => setForm((f) => ({ ...f, allowBonusCreditOnListingContacts: e.target.checked }))}
            />
            Bonusový kredit na kontakty klasických inzerátů
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.allowBonusCreditOnTipContacts}
              onChange={(e) => setForm((f) => ({ ...f, allowBonusCreditOnTipContacts: e.target.checked }))}
            />
            Bonusový kredit na kontakty tipů (nedoporučeno)
          </label>
        </div>
        <button
          type="submit"
          disabled={saving || loading}
          className="rounded-xl bg-[#e85d00] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Ukládám…' : 'Uložit nastavení'}
        </button>
      </form>
    </main>
  );
}
