'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestConfirmWhatsAppVerification,
  nestRequestWhatsAppVerification,
  nestSendEmailVerification,
  nestUploadAvatar,
} from '@/lib/nest-client';
import {
  fetchWorkerSelfSettings,
  updateWorkerSelfSettings,
  type WorkerSelfSettings,
} from '@/lib/portal-worker-crm-api';

function VerifyBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
      }`}
    >
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}

export function PortalWorkerSettingsPanel() {
  const { apiAccessToken } = useAuth();
  const [settings, setSettings] = useState<WorkerSelfSettings | null>(null);
  const [phone, setPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [waCode, setWaCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const s = await fetchWorkerSelfSettings();
    setSettings(s);
    if (s) {
      setPhone(s.phone ?? '');
      setWhatsappPhone(s.whatsappPhone ?? '');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePhone() {
    setBusy(true);
    setErr(null);
    const r = await updateWorkerSelfSettings({ phone, whatsappPhone });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Uložení selhalo');
      return;
    }
    setMsg('Kontakty uloženy.');
    await load();
  }

  async function onAvatar(file: File) {
    if (!apiAccessToken) return;
    setBusy(true);
    const r = await nestUploadAvatar(apiAccessToken, file);
    setBusy(false);
    if (r.error) {
      setErr(r.error);
      return;
    }
    setMsg('Profilová fotka aktualizována.');
    await load();
  }

  async function sendEmailVerify() {
    if (!apiAccessToken) return;
    setBusy(true);
    const r = await nestSendEmailVerification(apiAccessToken);
    setBusy(false);
    setMsg(r.ok ? (r.message ?? 'Ověřovací e-mail odeslán.') : null);
    if (!r.ok) setErr(r.error ?? 'Odeslání selhalo');
  }

  async function requestWaCode() {
    if (!apiAccessToken) return;
    setBusy(true);
    const r = await nestRequestWhatsAppVerification(apiAccessToken, whatsappPhone || phone);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Nepodařilo odeslat kód');
      return;
    }
    setMsg('Ověřovací kód byl odeslán na WhatsApp.');
  }

  async function confirmWaCode() {
    if (!apiAccessToken || !waCode.trim()) return;
    setBusy(true);
    const r = await nestConfirmWhatsAppVerification(apiAccessToken, waCode.trim());
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Neplatný kód');
      return;
    }
    setMsg('WhatsApp číslo ověřeno.');
    setWaCode('');
    await load();
  }

  if (!settings) {
    return <p className="text-sm text-zinc-500">Načítám nastavení…</p>;
  }

  const avatarSrc = settings.avatarUrl ? nestAbsoluteAssetUrl(settings.avatarUrl) : '';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">Nastavení účtu</h2>
        <p className="mt-1 text-sm text-zinc-600">Profil, ověření kontaktů a limity bonusů.</p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="font-semibold">Profilová fotka</h3>
        <div className="mt-3 flex items-center gap-4">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" className="size-20 rounded-full object-cover ring-2 ring-orange-100" />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full bg-zinc-100 text-2xl text-zinc-400">
              ?
            </div>
          )}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onAvatar(f);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
            >
              Nahrát fotku
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="font-semibold">Stav ověření</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <VerifyBadge ok={settings.emailVerified} label="E-mail ověřen" />
          <VerifyBadge ok={settings.phoneVerified} label="Telefon ověřen" />
          <VerifyBadge ok={settings.whatsappVerified} label="WhatsApp ověřen" />
        </div>
        <p className="mt-3 text-sm text-zinc-600">
          E-mail: <strong>{settings.email}</strong>
        </p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <h3 className="font-semibold">Kontaktní údaje</h3>
        <label className="block text-sm">
          Telefon
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="+420…"
          />
        </label>
        <label className="block text-sm">
          WhatsApp číslo
          <input
            value={whatsappPhone}
            onChange={(e) => setWhatsappPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="+420…"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void savePhone()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Uložit telefon
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <h3 className="font-semibold">Ověření e-mailu</h3>
        <button
          type="button"
          disabled={busy || settings.emailVerified}
          onClick={() => void sendEmailVerify()}
          className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-[#e85d00] disabled:opacity-50"
        >
          {settings.emailVerified ? 'E-mail je ověřen' : 'Odeslat ověřovací e-mail'}
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <h3 className="font-semibold">Ověření WhatsApp</h3>
        <p className="text-sm text-zinc-600">Kód přijde přes napojené WhatsApp API portálu.</p>
        <button
          type="button"
          disabled={busy || settings.whatsappVerified}
          onClick={() => void requestWaCode()}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
        >
          Odeslat ověřovací kód
        </button>
        {!settings.whatsappVerified ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={waCode}
              onChange={(e) => setWaCode(e.target.value)}
              placeholder="Kód z WhatsApp"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy || !waCode.trim()}
              onClick={() => void confirmWaCode()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Potvrdit kód
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
        <p>
          Limit bonusových kreditů na klienta:{' '}
          <strong>{settings.maxBonusPerClient?.toLocaleString('cs-CZ')} Kč</strong>
        </p>
        <p className="mt-1">
          Přidělování bonusů:{' '}
          <strong>{settings.canAssignBonusCredits ? 'povoleno' : 'zakázáno'}</strong>
        </p>
        {settings.maxBonusPerDay != null ? (
          <p className="mt-1">
            Denní limit bonusů:{' '}
            <strong>{settings.maxBonusPerDay.toLocaleString('cs-CZ')} Kč</strong>
          </p>
        ) : null}
        {settings.maxBonusPerMonth != null ? (
          <p className="mt-1">
            Měsíční limit bonusů:{' '}
            <strong>{settings.maxBonusPerMonth.toLocaleString('cs-CZ')} Kč</strong>
          </p>
        ) : null}
        {settings.commissionPercent != null ? (
          <p className="mt-1">
            Vaše provize: <strong>{settings.commissionPercent} %</strong>
          </p>
        ) : null}
      </section>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
