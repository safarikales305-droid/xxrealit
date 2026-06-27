'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

type ClientAdminDetail = {
  kind: string;
  id: string;
  profile: Record<string, unknown>;
  emailHistory?: Array<{
    id: string;
    type: string;
    templateKey?: string | null;
    subject: string;
    status: string;
    createdAt: string;
    errorMessage?: string | null;
  }>;
  worker?: { id: string; name: string; email: string };
};

export default function AdminCrmClientDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [detail, setDetail] = useState<ClientAdminDetail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!apiAccessToken || !API_BASE_URL || !id) return;
    const res = await fetch(`${API_BASE_URL}/admin/portal-workers/crm/clients/${encodeURIComponent(id)}`, {
      headers: { ...nestAuthHeaders(apiAccessToken), Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      setErr('Klient nenalezen');
      return;
    }
    setDetail((await res.json()) as ClientAdminDetail);
  }, [apiAccessToken, id]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void load();
  }, [user, isLoading, router, load]);

  async function sendRegistrationEmail() {
    if (!apiAccessToken || !API_BASE_URL) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(
      `${API_BASE_URL}/admin/portal-workers/crm/clients/${encodeURIComponent(id)}/send-registration-email`,
      { method: 'POST', headers: { ...nestAuthHeaders(apiAccessToken), Accept: 'application/json' } },
    );
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setBusy(false);
    if (!res.ok) {
      setErr(data.message ?? 'Odeslání selhalo');
      return;
    }
    setMsg(data.message ?? 'E-mail odeslán');
    await load();
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Link href="/admin/pracovnici-portalu/crm" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← CRM pracovníků
        </Link>
        <p className="text-sm text-zinc-600">{err ?? 'Načítám…'}</p>
      </div>
    );
  }

  const p = detail.profile;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/pracovnici-portalu/crm" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← CRM pracovníků
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{String(p.name ?? 'Klient')}</h1>
        {detail.worker ? (
          <p className="text-sm text-zinc-600">
            Pracovník: {detail.worker.name} ({detail.worker.email})
          </p>
        ) : null}
      </div>

      <section className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 text-sm">
        <p>
          <strong>E-mail:</strong> {String(p.email ?? '')}
        </p>
        <p>
          <strong>Telefon:</strong> {String(p.phone ?? '')}
        </p>
        <p className="sm:col-span-2">
          <strong>BIO (veřejný profil):</strong>
          <br />
          {String(p.bio ?? '—')}
        </p>
        <p className="sm:col-span-2">
          <strong>Popis činnosti:</strong>
          <br />
          {String(p.activityDescription ?? '—')}
        </p>
        <p className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <strong>Interní poznámka pracovníka:</strong>
          <br />
          {String(p.workerInternalNote ?? p.initialNote ?? '—')}
        </p>
      </section>

      <button
        type="button"
        disabled={busy}
        onClick={() => void sendRegistrationEmail()}
        className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Poslat e-mail pro dokončení registrace
      </button>

      {detail.emailHistory && detail.emailHistory.length > 0 ? (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">Historie e-mailů</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th>Datum</th>
                <th>Šablona</th>
                <th>Předmět</th>
                <th>Stav</th>
              </tr>
            </thead>
            <tbody>
              {detail.emailHistory.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="py-2">{new Date(e.createdAt).toLocaleString('cs-CZ')}</td>
                  <td>{e.templateKey ?? e.type}</td>
                  <td>{e.subject}</td>
                  <td>
                    {e.status}
                    {e.errorMessage ? ` (${e.errorMessage})` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
