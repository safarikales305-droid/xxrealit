'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestFetchReferralInfo, nestLogReferralInvite, type ReferralInfo } from '@/lib/marketing-bonus';

export function InviteFriendsPanel() {
  const { apiAccessToken } = useAuth();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!apiAccessToken) return;
    const data = await nestFetchReferralInfo(apiAccessToken);
    setInfo(data);
  }, [apiAccessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function shareWhatsApp() {
    if (!apiAccessToken || !info) return;
    setBusy(true);
    await nestLogReferralInvite(apiAccessToken, { channel: 'WHATSAPP' });
    const text = encodeURIComponent(
      `Přidej se na XXRealit — portál pro realitní inzeráty a komunitu: ${info.referralUrl}`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
    setMsg('Pozvánka přes WhatsApp byla zaznamenána.');
    setBusy(false);
    void refresh();
  }

  async function shareEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!apiAccessToken || !info) return;
    setBusy(true);
    setMsg(null);
    const target = email.trim();
    await nestLogReferralInvite(apiAccessToken, {
      channel: 'EMAIL',
      target: target || undefined,
    });
    const subject = encodeURIComponent('Pozvánka na XXRealit');
    const body = encodeURIComponent(
      `Ahoj,\n\npřidej se na portál XXRealit:\n${info.referralUrl}\n\nTěším se na tebe!`,
    );
    const mailto = target
      ? `mailto:${encodeURIComponent(target)}?subject=${subject}&body=${body}`
      : `mailto:?subject=${subject}&body=${body}`;
    window.location.href = mailto;
    setEmail('');
    setMsg('Pozvánka e-mailem byla zaznamenána.');
    setBusy(false);
    void refresh();
  }

  if (!info) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-zinc-900">Pozvat přátele</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Sdílejte unikátní odkaz a získejte bonusové kredity podle aktivních akcí.
      </p>

      <div className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-700 break-all">
        {info.referralUrl}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void shareWhatsApp()}
          className="rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          WhatsApp
        </button>
      </div>

      <form onSubmit={(e) => void shareEmail(e)} className="mt-3 flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail přítele (volitelné)"
          className="min-w-[200px] flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Pozvat e-mailem
        </button>
      </form>

      <p className="mt-3 text-xs text-zinc-500">
        Odesláno: {info.stats.emailInvites} e-mailů · {info.stats.whatsappInvites} WhatsApp ·{' '}
        {info.stats.registrations} registrací
      </p>
      {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}
    </section>
  );
}
