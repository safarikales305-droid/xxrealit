'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchBulkHistory,
  fetchBulkTemplates,
  sendBulkMessage,
  type WorkerBulkHistoryRow,
  type WorkerBulkTemplate,
} from '@/lib/portal-worker-communication-api';

export default function AdminWorkerBulkMessagesPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [templates, setTemplates] = useState<WorkerBulkTemplate[]>([]);
  const [history, setHistory] = useState<WorkerBulkHistoryRow[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [approvedOnly, setApprovedOnly] = useState(true);
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, h] = await Promise.all([
      fetchBulkTemplates(apiAccessToken),
      fetchBulkHistory(apiAccessToken),
    ]);
    setTemplates(t.items ?? []);
    setHistory(h.items ?? []);
  }, [apiAccessToken]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void load();
  }, [user, isLoading, router, load]);

  useEffect(() => {
    if (!templateId) return;
    const t = templates.find((x) => x.id === templateId);
    if (t) setBody(t.body);
  }, [templateId, templates]);

  async function send() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await sendBulkMessage(apiAccessToken, {
      campaignName: campaignName.trim() || 'Hromadná zpráva',
      body,
      filter: { activeOnly, approvedOnly, region: region.trim() || undefined, district: district.trim() || undefined },
      saveAsTemplate,
      templateName: templateName.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Odeslání selhalo');
      return;
    }
    setMsg(`Odesláno ${r.recipientCount} pracovníkům (e-mailů: ${r.emailsSent}, chyb: ${r.emailErrors}).`);
    setCampaignName('');
    setBody('');
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/pracovnici-portalu" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Pracovníci portálu
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Hromadné zprávy</h1>
      </div>

      {msg ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{msg}</p> : null}
      {err ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold">Nová kampaň</h2>
        <label className="block text-sm">
          Název kampaně
          <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Šablona
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
            <option value="">— vybrat šablonu —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.templateName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Text zprávy
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={approvedOnly} onChange={(e) => setApprovedOnly(e.target.checked)} />
            Jen schválení
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Jen aktivní
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
            Uložit jako šablonu
          </label>
        </div>
        {saveAsTemplate ? (
          <label className="block text-sm">
            Název šablony
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            Kraj (filtr)
            <input value={region} onChange={(e) => setRegion(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="např. Jihomoravský" />
          </label>
          <label className="block text-sm">
            Okres / město (filtr)
            <input value={district} onChange={(e) => setDistrict(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="např. Brno" />
          </label>
        </div>
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={() => void send()}
          className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Odeslat hromadnou zprávu
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Historie kampaní</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-zinc-500">
                <th className="py-2 pr-3">Kampaň</th>
                <th className="py-2 pr-3">Příjemci</th>
                <th className="py-2 pr-3">E-maily</th>
                <th className="py-2 pr-3">Chyby</th>
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2">Admin</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3">{h.campaignName}</td>
                  <td className="py-2 pr-3">{h.recipientCount}</td>
                  <td className="py-2 pr-3">{h.emailsSent}</td>
                  <td className="py-2 pr-3">{h.emailErrors}</td>
                  <td className="py-2 pr-3">{h.sentAt ? new Date(h.sentAt).toLocaleString('cs-CZ') : '—'}</td>
                  <td className="py-2">{h.admin.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
