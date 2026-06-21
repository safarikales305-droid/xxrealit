'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { WhatsAppPhoneVerificationCard } from '@/components/profile/WhatsAppPhoneVerificationCard';
import {
  nestFetchMe,
  nestPatchProfileBio,
  type NestMeProfile,
} from '@/lib/nest-client';
import { nestVerifyEmail } from '@/lib/marketing-bonus';

type Props = {
  token: string | null;
  onSaved?: (me: NestMeProfile) => void;
};

export function ProfileDetailsForm({ token, onSaved }: Props) {
  const [me, setMe] = useState<NestMeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [profileIco, setProfileIco] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [phone, setPhone] = useState('');
  const [phonePublic, setPhonePublic] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const row = await nestFetchMe(token);
    setLoading(false);
    if (!row) return;
    setMe(row);
    setFirstName(row.firstName?.trim() || row.name?.split(/\s+/)[0] || '');
    setLastName(
      row.lastName?.trim() ||
        (row.name?.includes(' ') ? row.name.split(/\s+/).slice(1).join(' ') : ''),
    );
    setCompanyName(
      row.brokerOfficeName?.trim() ||
        row.agentProfile?.companyName?.trim() ||
        row.companyProfile?.companyName?.trim() ||
        row.agencyProfile?.agencyName?.trim() ||
        '',
    );
    setProfileIco(
      row.profileIco?.trim() ||
        row.agentProfile?.ico?.trim() ||
        row.companyProfile?.ico?.trim() ||
        row.agencyProfile?.ico?.trim() ||
        row.financialAdvisorProfile?.ico?.trim() ||
        '',
    );
    setAddress(row.address?.trim() || '');
    setCity(
      row.city?.trim() ||
        row.agentProfile?.city?.trim() ||
        row.companyProfile?.city?.trim() ||
        '',
    );
    setPostalCode(row.postalCode?.trim() || '');
    setBankAccount(row.tiparPayoutBankAccount?.trim() || '');
    setPhone(row.phone?.trim() || '');
    setPhonePublic(Boolean(row.phonePublic));
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    if (!token) return;
    setSaving(true);
    setError(null);
    setOk(null);
    const res = await nestPatchProfileBio(token, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      brokerOfficeName: companyName.trim() || undefined,
      profileIco: profileIco.trim() || undefined,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      tiparPayoutBankAccount: bankAccount.trim() || null,
      phone: phone.trim() || undefined,
      phonePublic,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení se nezdařilo.');
      return;
    }
    setOk('Údaje profilu byly uloženy.');
    const fresh = await nestFetchMe(token);
    if (fresh) {
      setMe(fresh);
      onSaved?.(fresh);
    } else {
      void load();
    }
  }

  async function onVerifyEmail() {
    if (!token) return;
    setVerifyingEmail(true);
    setError(null);
    const success = await nestVerifyEmail(token);
    setVerifyingEmail(false);
    if (!success) {
      setError('Ověření e-mailu se nezdařilo.');
      return;
    }
    setOk('E-mail byl označen jako ověřený.');
    void load();
  }

  if (!token) return null;

  return (
    <div
      id="profile-details-form"
      className="scroll-mt-24 space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Údaje profilu</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Vyplňte povinné údaje pro ověřený štítek, tipaře a dobití kreditu.
        </p>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Načítám…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

      {!loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-zinc-800">
            Jméno
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Příjmení
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800 sm:col-span-2">
            Název firmy
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal"
              placeholder="Pro makléře, firmu nebo kancelář"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            IČO
            <input
              value={profileIco}
              onChange={(e) => setProfileIco(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            PSČ
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800 sm:col-span-2">
            Adresa
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal"
              placeholder="Ulice a číslo popisné"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Město
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Bankovní účet pro výplatu provizí
            <input
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal"
              placeholder="123456789/0100"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Telefon
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal"
              placeholder="+420123456789"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={phonePublic}
              onChange={(e) => setPhonePublic(e.target.checked)}
            />
            Zobrazit telefon veřejně
          </label>
          <div className="sm:col-span-2 rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-sm font-semibold text-zinc-800">E-mail</p>
            <p className="mt-1 text-sm text-zinc-600">{me?.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {me?.emailVerified ? (
                <span className="text-xs font-semibold text-emerald-700">✓ E-mail ověřen</span>
              ) : (
                <button
                  type="button"
                  disabled={verifyingEmail}
                  onClick={() => void onVerifyEmail()}
                  className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold"
                >
                  {verifyingEmail ? 'Ověřuji…' : 'Ověřit e-mail'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <WhatsAppPhoneVerificationCard token={token} onVerified={() => void load()} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void onSave()}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Ukládám…' : 'Uložit údaje profilu'}
        </button>
        <Link
          href="/profil"
          className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800"
        >
          Zpět na profil
        </Link>
      </div>
    </div>
  );
}
