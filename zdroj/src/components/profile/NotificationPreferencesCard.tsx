'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestGetNotificationPrefs,
  nestPatchNotificationPrefs,
  nestPushAdminStatus,
  nestPushVapidPublicKey,
  type NotificationPrefs,
} from '@/lib/nest-client';
import { subscribeToWebPush } from '@/components/pwa/PwaServiceWorkerRegister';
import { dispatchNotificationsChanged } from '@/hooks/use-notifications-unread';
import { useAuth } from '@/hooks/use-auth';

type Props = {
  token: string | null;
};

export function NotificationPreferencesCard({ token }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [adminPush, setAdminPush] = useState<{
    configured: boolean;
    issues: string[];
    instructions: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setPrefs(null);
      setAdminPush(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [row, adminStatus] = await Promise.all([
      nestGetNotificationPrefs(token),
      isAdmin ? nestPushAdminStatus(token) : Promise.resolve(null),
    ]);
    setPrefs(row);
    setAdminPush(adminStatus);
    setLoading(false);
  }, [token, isAdmin]);

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
      const instructions =
        prefs?.pushSetupInstructions?.length
          ? prefs.pushSetupInstructions
          : adminPush?.instructions ?? [];
      setError(
        instructions.length > 0
          ? `Push notifikace nejsou na serveru aktivní. ${instructions.join(' ')}`
          : 'Push notifikace zatím nejsou na serveru aktivní (chybí VAPID klíče).',
      );
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

  const setupInstructions =
    adminPush?.instructions?.length
      ? adminPush.instructions
      : prefs?.pushSetupInstructions ?? [];
  const setupIssues = adminPush?.issues?.length
    ? adminPush.issues
    : prefs?.pushSetupIssues ?? [];

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

      {isAdmin && !prefs?.pushConfigured ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="font-semibold">Nastavení VAPID pro administrátora</p>
          {setupIssues.length > 0 ? (
            <ul className="mt-1 list-inside list-disc">
              {setupIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
          {setupInstructions.length > 0 ? (
            <ol className="mt-2 list-inside list-decimal space-y-1">
              {setupInstructions.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

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
              disabled={!prefs.pushConfigured && pushBusy}
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
