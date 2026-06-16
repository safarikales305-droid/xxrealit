'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CommunicationShell } from '@/components/communication/CommunicationShell';
import { useAuth } from '@/hooks/use-auth';
import { canAccessCommunication } from '@/lib/communication-roles';
import {
  nestCommunicationEmailLogs,
  nestCommunicationEmailSend,
  type EmailLogRow,
} from '@/lib/communication-api';

export default function EmailCentrumPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLogs(await nestCommunicationEmailLogs(token));
  }, [token]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/prihlaseni?redirect=/profil/komunikace/emaily');
    else if (!canAccessCommunication(user.role)) router.replace('/profil/dashboard');
    else void refresh();
  }, [user, isLoading, router, refresh]);

  async function handleSend() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    const res = await nestCommunicationEmailSend(token, { to, subject, body });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setMsg('E-mail odeslán.');
    setTo('');
    setSubject('');
    setBody('');
    void refresh();
  }

  return (
    <CommunicationShell title="E-mail centrum">
      <div className="space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-900">Individuální e-mail</h2>
          <div className="mt-3 grid gap-3">
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Příjemce"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Předmět"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className="min-h-[120px] rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Text e-mailu"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={busy || !to || !subject || !body}
            className="mt-3 rounded-full bg-[#ff6a00] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void handleSend()}
          >
            Odeslat e-mail
          </button>
        </section>

        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        {err ? <p className="text-sm text-red-600">{err}</p> : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-900">Historie e-mailů</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b text-zinc-500">
                  <th className="py-2 pr-2">Příjemce</th>
                  <th className="py-2 pr-2">Předmět</th>
                  <th className="py-2 pr-2">Datum</th>
                  <th className="py-2">Stav</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-2">{l.to}</td>
                    <td className="py-2 pr-2">{l.subject}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-2">
                      {l.delivered ? (
                        <span className="text-emerald-700">Doručeno</span>
                      ) : l.status === 'failed' ? (
                        <span className="text-red-600">Chyba</span>
                      ) : (
                        <span className="text-zinc-600">{l.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </CommunicationShell>
  );
}
