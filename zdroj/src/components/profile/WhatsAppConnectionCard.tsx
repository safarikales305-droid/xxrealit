'use client';

import { useCallback, useEffect, useState } from 'react';
import { nestFetchMe, nestPatchWhatsAppSettings } from '@/lib/nest-client';

const E164_HINT = '+420123456789';
const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

type Props = {
  token: string | null;
};

export function WhatsAppConnectionCard({ token }: Props) {
  const [phone, setPhone] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [notifyMyUploads, setNotifyMyUploads] = useState(false);
  const [notifyNewPosts, setNotifyNewPosts] = useState(false);
  const [marketingOptOut, setMarketingOptOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const me = await nestFetchMe(token);
    setPhone(me?.whatsappPhone ?? '');
    setEnabled(Boolean(me?.whatsappEnabled));
    setNotifyMyUploads(Boolean(me?.whatsappNotifyMyUploads));
    setNotifyNewPosts(Boolean(me?.whatsappNotifyNewPosts));
    setMarketingOptOut(Boolean(me?.whatsappMarketingOptOut));
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSave() {
    if (!token) return;
    const trimmed = phone.trim();
    if (enabled && !PHONE_REGEX.test(trimmed)) {
      setError(`Zadejte platné číslo ve formátu ${E164_HINT}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await nestPatchWhatsAppSettings(token, {
      whatsappPhone: trimmed || undefined,
      whatsappEnabled: enabled,
      whatsappNotifyMyUploads: notifyMyUploads,
      whatsappNotifyNewPosts: notifyNewPosts,
      whatsappMarketingOptOut: marketingOptOut,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení WhatsApp nastavení selhalo.');
      return;
    }
    setOk('WhatsApp nastavení bylo uloženo.');
    void refresh();
  }

  if (!token) return null;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
      <div>
        <p className="text-sm font-semibold text-zinc-900">WhatsApp propojení</p>
        <p className="mt-1 text-sm text-zinc-600">
          Zadejte své WhatsApp číslo. Návštěvníci uvidí tlačítko „Napsat na WhatsApp“ u vašeho
          profilu a inzerátů — číslo se nikde veřejně nezobrazí.
        </p>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Načítám…</p> : null}

      {!loading ? (
        <>
          <label className="block text-sm font-semibold text-zinc-800">
            WhatsApp číslo
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={E164_HINT}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Zobrazit tlačítko „Napsat na WhatsApp“
          </label>

          <div className="mt-2 space-y-2 border-t border-zinc-200 pt-3">
            <p className="text-sm font-semibold text-zinc-900">WhatsApp upozornění</p>
            <label className="flex items-start gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={notifyMyUploads}
                onChange={(e) => setNotifyMyUploads(e.target.checked)}
              />
              <span>Upozornění na moje uploady (po úspěšném nahrání příspěvku)</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={notifyNewPosts}
                onChange={(e) => setNotifyNewPosts(e.target.checked)}
              />
              <span>Upozornění na nové příspěvky sledovaných uživatelů</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!marketingOptOut}
                onChange={(e) => setMarketingOptOut(!e.target.checked)}
              />
              <span>Marketingová WhatsApp upozornění (kampaně portálu)</span>
            </label>
            <p className="text-xs text-zinc-500">
              Upozornění na příspěvky vyžadují platné číslo a souhlas s komunikací přes WhatsApp.
            </p>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Ukládám…' : 'Uložit WhatsApp'}
          </button>
        </>
      ) : null}
    </div>
  );
}
