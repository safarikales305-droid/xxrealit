'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  WORKER_CLIENT_ROLES,
  fetchWorkerClientDetail,
  sendWorkerClientEmail,
} from '@/lib/portal-worker-crm-api';
import { WorkerClientBonusCreditSection } from '@/components/portal-worker/worker-client-bonus-credit-section';

type ClientDetail = Record<string, unknown>;

async function patchWorkerClient(
  id: string,
  payload: Record<string, unknown>,
  kind?: string,
): Promise<{ ok: boolean; error?: string }> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  const res = await fetch(`/api/nest/portal-worker/clients/${encodeURIComponent(id)}${qs}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: res.ok, error: res.ok ? undefined : (data.message ?? 'Uložení selhalo') };
}

type Props = {
  clientId: string;
  onSaved?: () => void;
};

export function WorkerClientEditForm({ clientId, onSaved }: Props) {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetchWorkerClientDetail(clientId);
    if (!d) return;
    setDetail(d);
    const p = (d.profile ?? {}) as Record<string, string>;
    setForm({
      firstName: String(p.firstName ?? ''),
      lastName: String(p.lastName ?? ''),
      company: String(p.company ?? ''),
      email: String(p.email ?? ''),
      phone: String(p.phone ?? ''),
      whatsappPhone: String(p.whatsapp ?? p.phone ?? ''),
      targetRole: String(p.role ?? 'AGENT'),
      address: String(p.address ?? ''),
      city: String(p.city ?? ''),
      website: String(p.website ?? ''),
      ico: String(p.ico ?? ''),
      activityDescription: String(p.activityDescription ?? ''),
      bio: String(p.bio ?? ''),
      workerInternalNote: String(p.workerInternalNote ?? p.initialNote ?? ''),
    });
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isPrereg = detail?.kind === 'preregistration';
  const preregId = isPrereg ? clientId : (detail?.preregistrationId as string | null);
  const emailHistory = (detail?.emailHistory ?? []) as Array<{
    id: string;
    type: string;
    templateKey?: string | null;
    subject: string;
    status: string;
    createdAt: string;
    errorMessage?: string | null;
  }>;

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await patchWorkerClient(
      clientId,
      {
        ...form,
        whatsappPhone: form.whatsappPhone,
      },
      isPrereg ? 'preregistration' : undefined,
    );
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Uložení selhalo');
      return;
    }
    setMsg('Údaje klienta uloženy.');
    await load();
    onSaved?.();
  }

  async function resendRegistrationEmail() {
    if (!preregId) return;
    setBusy(true);
    const r = await sendWorkerClientEmail(preregId);
    setBusy(false);
    setMsg(r.ok ? (r.message ?? 'Registrační e-mail odeslán.') : null);
    if (!r.ok) setErr(r.error ?? 'Odeslání selhalo');
    else await load();
  }

  if (!detail) return <p className="text-sm text-zinc-500">Načítám klienta…</p>;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
        <label className="block text-sm">
          Jméno
          <input
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Příjmení
          <input
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Firma
          <input
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Role
          <select
            value={form.targetRole}
            onChange={(e) => setForm((f) => ({ ...f, targetRole: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {WORKER_CLIENT_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          E-mail
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Telefon
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          WhatsApp
          <input
            value={form.whatsappPhone}
            onChange={(e) => setForm((f) => ({ ...f, whatsappPhone: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          IČ
          <input
            value={form.ico}
            onChange={(e) => setForm((f) => ({ ...f, ico: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Adresa
          <input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Město
          <input
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Web
          <input
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Popis činnosti (veřejný profil)
          <textarea
            value={form.activityDescription}
            onChange={(e) => setForm((f) => ({ ...f, activityDescription: e.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          BIO (veřejný profil na portálu)
          <textarea
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Poznámka pracovníka (pouze interní CRM)
          <textarea
            value={form.workerInternalNote}
            onChange={(e) => setForm((f) => ({ ...f, workerInternalNote: e.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
          />
        </label>
      </section>

      {detail.kind === 'client' ? (
        <WorkerClientBonusCreditSection
          clientUserId={clientId}
          profile={(detail.profile ?? {}) as { realCredit?: number; bonusCredit?: number; totalCredit?: number }}
          bonusCreditInfo={
            (detail.bonusCreditInfo ?? null) as {
              canAssign: boolean;
              maxBonusPerClient?: number;
              maxBonusPerDay?: number | null;
              maxBonusPerMonth?: number | null;
              bonusGrantedToClient?: number;
              bonusRemainingOnClient?: number;
            } | null
          }
          workerBonusHistory={
            (detail.workerBonusHistory ?? []) as Array<{
              id: string;
              amount: number;
              description?: string | null;
              purpose?: string | null;
              createdAt: string;
            }>
          }
          onGranted={load}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Uložit údaje klienta
        </button>
        {preregId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void resendRegistrationEmail()}
            className="rounded-lg border border-[#e85d00] px-4 py-2 text-sm font-semibold text-[#e85d00] disabled:opacity-50"
          >
            Poslat e-mail pro dokončení registrace
          </button>
        ) : null}
      </div>

      {emailHistory.length > 0 ? (
        <section className="rounded-xl border bg-white p-4 text-sm">
          <h3 className="font-semibold">Historie e-mailů klientovi</h3>
          <ul className="mt-2 space-y-1">
            {emailHistory.map((e) => (
              <li key={e.id} className="text-xs text-zinc-600">
                {new Date(e.createdAt).toLocaleString('cs-CZ')} · {e.templateKey ?? e.type} · {e.subject} ·{' '}
                <strong>{e.status}</strong>
                {e.errorMessage ? ` — ${e.errorMessage}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
