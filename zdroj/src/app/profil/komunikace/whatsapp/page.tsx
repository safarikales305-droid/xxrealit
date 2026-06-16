'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CommunicationShell } from '@/components/communication/CommunicationShell';
import { useAuth } from '@/hooks/use-auth';
import { canAccessCommunication } from '@/lib/communication-roles';
import {
  nestCommunicationWhatsAppListingLeads,
  nestCommunicationWhatsAppMessages,
  nestCommunicationWhatsAppSend,
  type WhatsAppMessageRow,
} from '@/lib/communication-api';

export default function WhatsAppCentrumPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;
  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([]);
  const [listingFilter, setListingFilter] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [listingId, setListingId] = useState('');
  const [bulkListingId, setBulkListingId] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const rows = await nestCommunicationWhatsAppMessages(token, {
      listingId: listingFilter || undefined,
    });
    setMessages(rows);
  }, [token, listingFilter]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/prihlaseni?redirect=/profil/komunikace/whatsapp');
    else if (!canAccessCommunication(user.role)) router.replace('/profil/dashboard');
    else void refresh();
  }, [user, isLoading, router, refresh]);

  async function handleSend() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await nestCommunicationWhatsAppSend(token, {
      toPhone: phone,
      recipientName: name || undefined,
      message: text,
      listingId: listingId || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    if (res.waUrl) window.open(res.waUrl, '_blank', 'noopener,noreferrer');
    setMsg('Zpráva zaznamenána.');
    setPhone('');
    setText('');
    void refresh();
  }

  async function handleBulk() {
    if (!token || !bulkListingId) return;
    setBusy(true);
    setErr(null);
    const res = await nestCommunicationWhatsAppListingLeads(token, {
      listingId: bulkListingId,
      message: bulkText,
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setMsg(`Odesláno zájemcům: ${res.sent}, chyb: ${res.failed}`);
    void refresh();
  }

  return (
    <CommunicationShell title="WhatsApp centrum">
      <div className="space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-900">Odeslat zprávu</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Telefon (+420…)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Jméno příjemce"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
              placeholder="ID inzerátu (volitelné)"
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
            />
            <textarea
              className="min-h-[100px] rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
              placeholder="Text zprávy"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={busy || !phone || !text}
            className="mt-3 rounded-full bg-[#25D366] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void handleSend()}
          >
            Odeslat WhatsApp
          </button>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-900">Všem zájemcům o inzerát</h2>
          <div className="mt-3 grid gap-3">
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="ID inzerátu"
              value={bulkListingId}
              onChange={(e) => setBulkListingId(e.target.value)}
            />
            <textarea
              className="min-h-[80px] rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Text zprávy"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={busy || !bulkListingId || !bulkText}
            className="mt-3 rounded-full border border-[#25D366] px-5 py-2 text-sm font-semibold text-[#128C7E] disabled:opacity-50"
            onClick={() => void handleBulk()}
          >
            Odeslat zájemcům
          </button>
        </section>

        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        {err ? <p className="text-sm text-red-600">{err}</p> : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-zinc-900">Historie zpráv</h2>
            <input
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
              placeholder="Filtr ID inzerátu"
              value={listingFilter}
              onChange={(e) => setListingFilter(e.target.value)}
            />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-zinc-500">
                  <th className="py-2 pr-2">Telefon</th>
                  <th className="py-2 pr-2">Jméno</th>
                  <th className="py-2 pr-2">Datum</th>
                  <th className="py-2 pr-2">Stav</th>
                  <th className="py-2">Obsah</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-2">{m.phone}</td>
                    <td className="py-2 pr-2">{m.recipientName ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-2 pr-2">
                      <span
                        className={
                          m.delivered ? 'text-emerald-700' : 'text-amber-700'
                        }
                      >
                        {m.delivered ? 'Doručeno' : 'Nedoručeno'}
                      </span>
                    </td>
                    <td className="max-w-xs truncate py-2">{m.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!messages.length ? (
              <p className="py-6 text-center text-zinc-500">Zatím žádné zprávy.</p>
            ) : null}
          </div>
        </section>
      </div>
    </CommunicationShell>
  );
}
