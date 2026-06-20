'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestGetNotificationPrefs,
  nestPatchNotificationPrefs,
  nestPushVapidPublicKey,
  type NotificationPrefs,
} from '@/lib/nest-client';
import { subscribeToWebPush } from '@/components/pwa/PwaServiceWorkerRegister';
import { dispatchNotificationsChanged } from '@/hooks/use-notifications-unread';

type Props = {
  token: string | null;
};

export function NotificationPreferencesCard({ token }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setPrefs(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const row = await nestGetNotificationPrefs(token);
    setPrefs(row);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(partial: Partial<NotificationPrefs>) {
    if (!token) return;
    setError(null);
    setMessage(null);
    const res = await nestPatchNotificationPrefs(token, partial);
    if (!res.ok) {
      setError(res.error ?? 'Uložení selhalo.');
      return;
    }
    setPrefs(res.prefs);
    setMessage('Nastavení upozornění uloženo.');
    dispatchNotificationsChanged();
  }

  async function enablePush() {
    if (!token) return;
    setPushBusy(true);
    setError(null);
    setMessage(null);
    const vapid = await nestPushVapidPublicKey(token);
    if (!vapid?.configured || !vapid.publicKey) {
      setPushBusy(false);
      setError('Push notifikace zatím nejsou na serveru aktivní (chybí VAPID klíče).');
      return;
    }
    const sub = await subscribeToWebPush(token, vapid.publicKey);
    setPushBusy(false);
    if (!sub.ok) {
      setError(sub.error ?? 'Aktivace push selhala.');
      return;
    }
    await patch({ notifyPwaPush: true });
    setMessage('PWA push upozornění jsou aktivní.');
    void load();
  }

  if (!token) return null;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Upozornění</p>
        <p className="mt-1 text-xs text-zinc-600">
          Vyberte, o čem chcete být informováni. Badge na ikoně aplikace zobrazí nepřečtené
          zprávy a notifikace.
        </p>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Načítám…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      {prefs ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={prefs.notifyNewPosts}
              onChange={(e) => void patch({ notifyNewPosts: e.target.checked })}
            />
            Nové příspěvky
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={prefs.notifyNewMessages}
              onChange={(e) => void patch({ notifyNewMessages: e.target.checked })}
            />
            Nové zprávy
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={prefs.notifyWhatsAppAlerts}
              onChange={(e) => void patch({ notifyWhatsAppAlerts: e.target.checked })}
            />
            WhatsApp upozornění
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={prefs.notifyPwaPush}
              onChange={(e) => {
                if (e.target.checked) {
                  void enablePush();
                } else {
                  void patch({ notifyPwaPush: false });
                }
              }}
            />
            PWA push upozornění
            {prefs.pushSubscribed ? (
              <span className="text-xs text-emerald-700">(aktivní)</span>
            ) : null}
          </label>
          {prefs.notifyPwaPush && !prefs.pushSubscribed ? (
            <button
              type="button"
              disabled={pushBusy}
              onClick={() => void enablePush()}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800"
            >
              {pushBusy ? 'Aktivuji…' : 'Povolit push v prohlížeči'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
