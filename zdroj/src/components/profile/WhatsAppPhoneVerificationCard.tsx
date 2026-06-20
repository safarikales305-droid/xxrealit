'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestConfirmWhatsAppVerification,
  nestRequestWhatsAppVerification,
  nestWhatsAppVerificationStatus,
  type WhatsAppVerificationStatusDto,
} from '@/lib/nest-client';

const E164_HINT = '+420123456789';
const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

type Props = {
  token: string | null;
  onVerified?: () => void;
};

export function WhatsAppPhoneVerificationCard({ token, onVerified }: Props) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<WhatsAppVerificationStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestBusy, setRequestBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  const refresh = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await nestWhatsAppVerificationStatus(token);
    if (data) {
      setStatus(data);
      if (data.whatsappPhone) setPhone(data.whatsappPhone);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status?.resendAvailableAt || status.canResend) {
      setResendCountdown(0);
      return;
    }
    const tick = () => {
      const target = new Date(status.resendAvailableAt!).getTime();
      const left = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setResendCountdown(left);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [status?.resendAvailableAt, status?.canResend]);

  async function handleRequest() {
    if (!token) return;
    const trimmed = phone.trim();
    if (!PHONE_REGEX.test(trimmed) && !/^\d{9}$/.test(trimmed.replace(/\s/g, ''))) {
      setError(`Zadejte platné číslo ve formátu ${E164_HINT} nebo 9 číslic.`);
      return;
    }
    setRequestBusy(true);
    setError(null);
    setOk(null);
    const res = await nestRequestWhatsAppVerification(token, trimmed);
    setRequestBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOk(res.message || 'Ověřovací kód byl odeslán na WhatsApp.');
    setStatus((prev) => ({ ...(prev ?? ({} as WhatsAppVerificationStatusDto)), ...res }));
    void refresh();
  }

  async function handleConfirm() {
    if (!token) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Zadejte ověřovací kód z WhatsApp.');
      return;
    }
    setConfirmBusy(true);
    setError(null);
    setOk(null);
    const res = await nestConfirmWhatsAppVerification(token, trimmed);
    setConfirmBusy(false);
    if (!res.ok) {
      setError(res.error);
      void refresh();
      return;
    }
    setOk(res.message || 'WhatsApp číslo bylo ověřeno.');
    setCode('');
    void refresh();
    onVerified?.();
  }

  if (!token) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-600">
        Načítám ověření WhatsApp…
      </div>
    );
  }

  if (status?.whatsappVerified) {
    return (
      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
        <p className="text-sm font-semibold text-emerald-900">Ověření WhatsApp čísla</p>
        <p className="text-sm text-emerald-800">
          Číslo <span className="font-mono font-medium">{status.whatsappPhone}</span> je ověřené
          {status.whatsappVerifiedAt
            ? ` od ${new Date(status.whatsappVerifiedAt).toLocaleString('cs-CZ')}`
            : ''}
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Ověření WhatsApp čísla</p>
        <p className="mt-1 text-sm text-zinc-600">
          Pro dobití kreditu, tipaře a ověření profesionálního profilu je nutné ověřit telefonní
          číslo přes WhatsApp. Kód platí 10 minut.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-zinc-700" htmlFor="wa-verify-phone">
          Telefonní číslo (E.164)
        </label>
        <input
          id="wa-verify-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={E164_HINT}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          autoComplete="tel"
        />
        <button
          type="button"
          disabled={requestBusy || (!status?.canResend && resendCountdown > 0)}
          onClick={() => void handleRequest()}
          className="rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1da851] disabled:opacity-60"
        >
          {requestBusy
            ? 'Odesílám…'
            : resendCountdown > 0
              ? `Znovu za ${resendCountdown} s`
              : 'Ověřit přes WhatsApp'}
        </button>
      </div>

      {status?.pendingVerification ? (
        <div className="space-y-2 border-t border-zinc-200 pt-4">
          <label className="block text-xs font-medium text-zinc-700" htmlFor="wa-verify-code">
            Ověřovací kód z WhatsApp
          </label>
          <input
            id="wa-verify-code"
            type="text"
            inputMode="numeric"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm tracking-widest"
          />
          <button
            type="button"
            disabled={confirmBusy}
            onClick={() => void handleConfirm()}
            className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d45500] disabled:opacity-60"
          >
            {confirmBusy ? 'Ověřuji…' : 'Potvrdit kód'}
          </button>
          {status.verificationAttempts > 0 ? (
            <p className="text-xs text-zinc-500">
              Pokusy: {status.verificationAttempts} / {status.maxVerificationAttempts}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
    </div>
  );
}
