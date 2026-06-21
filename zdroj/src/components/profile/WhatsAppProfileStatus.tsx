'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestBeginWhatsAppPhoneChange,
  nestConfirmWhatsAppVerification,
  nestRequestWhatsAppVerification,
  nestWhatsAppVerificationStatus,
  type WhatsAppVerificationStatusDto,
} from '@/lib/nest-client';

type Props = {
  token: string | null;
  whatsappVerified?: boolean;
  whatsappPhone?: string | null;
  onVerified?: () => void;
};

export function WhatsAppProfileStatus({
  token,
  whatsappVerified: verifiedProp,
  whatsappPhone: phoneProp,
  onVerified,
}: Props) {
  const [changing, setChanging] = useState(false);
  const [status, setStatus] = useState<WhatsAppVerificationStatusDto | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verified = status?.whatsappVerified ?? verifiedProp === true;
  const displayPhone = status?.whatsappPhone ?? phoneProp ?? '';

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const data = await nestWhatsAppVerificationStatus(token);
    if (data) {
      setStatus(data);
      if (data.whatsappPhone) setPhone(data.whatsappPhone);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (changing) void refresh();
  }, [changing, refresh]);

  if (!token) return null;

  if (!changing && verified) {
    return (
      <div id="whatsapp-verify" className="mt-5 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <p className="text-sm font-semibold text-zinc-900">
          WhatsApp:{' '}
          <span className="text-emerald-700">✓ Ověřeno</span>
          {displayPhone ? (
            <span className="ml-2 font-normal text-zinc-600">({displayPhone})</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              setChanging(true);
              setError(null);
              const res = await nestBeginWhatsAppPhoneChange(token);
              if (!res.ok) {
                setError(res.error);
                setChanging(false);
                return;
              }
              void refresh();
            })();
          }}
          className="mt-2 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
        >
          Změnit WhatsApp číslo
        </button>
      </div>
    );
  }

  if (!changing && !verified) {
    return (
      <div id="whatsapp-verify" className="mt-5 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <p className="text-sm font-semibold text-zinc-900">
          WhatsApp: <span className="text-red-600">✗ Neověřeno</span>
        </p>
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="mt-2 rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#1da851]"
        >
          Ověřit WhatsApp číslo
        </button>
      </div>
    );
  }

  return (
    <div id="whatsapp-verify" className="mt-5 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900">Ověření WhatsApp čísla</p>
        <button
          type="button"
          onClick={() => {
            setChanging(false);
            setCode('');
            setError(null);
          }}
          className="text-xs font-semibold text-zinc-600 underline"
        >
          Zrušit
        </button>
      </div>
      {loading ? <p className="text-sm text-zinc-500">Načítám…</p> : null}
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+420123456789"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true);
            setError(null);
            const res = await nestRequestWhatsAppVerification(token, phone.trim());
            setBusy(false);
            if (!res.ok) setError(res.error);
            else void refresh();
          })();
        }}
        className="rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        Odeslat kód
      </button>
      {status?.pendingVerification ? (
        <>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="Ověřovací kód"
            className="w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                const res = await nestConfirmWhatsAppVerification(token, code.trim());
                setBusy(false);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setChanging(false);
                setCode('');
                onVerified?.();
                void refresh();
              })();
            }}
            className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Potvrdit kód
          </button>
        </>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
