'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CommunicationShell } from '@/components/communication/CommunicationShell';
import { useAuth } from '@/hooks/use-auth';
import { canAccessCommunication } from '@/lib/communication-roles';
import {
  communicationContactsExportUrl,
  nestCommunicationContacts,
  nestCommunicationCreateContact,
  type CrmContactRow,
} from '@/lib/communication-api';
import { nestAuthHeaders } from '@/lib/nest-client';

export default function KontaktyPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;
  const [contacts, setContacts] = useState<CrmContactRow[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setContacts(await nestCommunicationContacts(token, { search: search || undefined }));
  }, [token, search]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/prihlaseni?redirect=/profil/kontakty');
    else if (!canAccessCommunication(user.role)) router.replace('/profil/dashboard');
    else void refresh();
  }, [user, isLoading, router, refresh]);

  async function handleAdd() {
    if (!token || !name.trim()) return;
    setBusy(true);
    await nestCommunicationCreateContact(token, { name, phone, email, notes });
    setBusy(false);
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
    void refresh();
  }

  async function handleExport() {
    if (!token) return;
    const res = await fetch(communicationContactsExportUrl(), {
      headers: nestAuthHeaders(token),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kontakty-xxrealit.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <CommunicationShell title="CRM zájemců">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-900">Nový kontakt</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Jméno"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Telefon"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Poznámka"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={busy || !name.trim()}
          className="mt-3 rounded-full bg-[#ff6a00] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => void handleAdd()}
        >
          Přidat kontakt
        </button>
      </section>

      <div className="flex flex-wrap gap-2">
        <input
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Hledat…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold"
          onClick={() => void refresh()}
        >
          Filtrovat
        </button>
        <button
          type="button"
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold"
          onClick={() => void handleExport()}
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b text-zinc-500">
              <th className="p-3">Jméno</th>
              <th className="p-3">Telefon</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Zdroj</th>
              <th className="p-3">Inzerát</th>
              <th className="p-3">Vytvořeno</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-zinc-100">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3">{c.phone || '—'}</td>
                <td className="p-3">{c.email || '—'}</td>
                <td className="p-3">{c.source}</td>
                <td className="p-3">{c.listing?.title ?? '—'}</td>
                <td className="p-3 whitespace-nowrap">
                  {new Date(c.createdAt).toLocaleDateString('cs-CZ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CommunicationShell>
  );
}
