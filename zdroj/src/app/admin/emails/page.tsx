'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCreateEmailCampaign,
  nestAdminEmailCampaigns,
  nestAdminEmailLogs,
  nestAdminEmailTemplates,
  nestAdminSendTemplateTest,
  nestAdminUpdateEmailTemplate,
  type NestEmailCampaignRow,
  type NestEmailLogRow,
  type NestEmailTemplateRow,
} from '@/lib/nest-client';

export default function AdminEmailsPage() {
  const { user, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [logs, setLogs] = useState<NestEmailLogRow[]>([]);
  const [templates, setTemplates] = useState<NestEmailTemplateRow[]>([]);
  const [campaigns, setCampaigns] = useState<NestEmailCampaignRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignSubject, setCampaignSubject] = useState('');
  const [campaignHtml, setCampaignHtml] = useState('<p>Obsah newsletteru...</p>');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  async function refresh() {
    if (!token) return;
    const [l, t, c] = await Promise.all([
      nestAdminEmailLogs(token),
      nestAdminEmailTemplates(token),
      nestAdminEmailCampaigns(token),
    ]);
    setLogs(l ?? []);
    setTemplates(t ?? []);
    setCampaigns(c ?? []);
    if (!selectedTemplateId && (t?.length ?? 0) > 0) setSelectedTemplateId(t?.[0]?.id ?? null);
  }

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      void refresh();
    }
  }, [token, user?.role]);

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900">E-maily</h1>
          <Link href="/admin" className="text-sm font-semibold text-orange-600 hover:underline">
            ← Zpět do administrace
          </Link>
        </div>
        {status ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
            {status}
          </p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Přehled / log e-mailů</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th>ID</th><th>Typ</th><th>Příjemce</th><th>Předmět</th><th>Stav</th><th>Šablona</th><th>Čas</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-zinc-100">
                    <td className="py-2 font-mono text-xs">{log.id.slice(0, 10)}...</td>
                    <td>{log.type}</td>
                    <td>{log.recipientEmail}</td>
                    <td>{log.subject}</td>
                    <td>{log.status}</td>
                    <td>{log.templateKey ?? '—'}</td>
                    <td>{new Date(log.createdAt).toLocaleString('cs-CZ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Šablony e-mailů</h2>
            <select
              className="mt-3 w-full rounded-lg border border-zinc-200 p-2 text-sm"
              value={selectedTemplateId ?? ''}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key} - {t.name}
                </option>
              ))}
            </select>
            {selectedTemplate ? (
              <div className="mt-3 space-y-2">
                <input
                  value={selectedTemplate.subject}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, subject: e.target.value } : x)),
                    )
                  }
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm"
                  placeholder="Subject"
                />
                <textarea
                  value={selectedTemplate.htmlContent}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, htmlContent: e.target.value } : x)),
                    )
                  }
                  rows={8}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-xs"
                />
                <textarea
                  value={selectedTemplate.textContent}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, textContent: e.target.value } : x)),
                    )
                  }
                  rows={4}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await nestAdminUpdateEmailTemplate(token, selectedTemplate.id, {
                        subject: selectedTemplate.subject,
                        htmlContent: selectedTemplate.htmlContent,
                        textContent: selectedTemplate.textContent,
                        isActive: selectedTemplate.isActive,
                      });
                      setStatus(r.ok ? 'Šablona byla uložena.' : r.error ?? 'Uložení selhalo.');
                      if (r.ok) await refresh();
                    }}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Uložit šablonu
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await nestAdminUpdateEmailTemplate(token, selectedTemplate.id, {
                        isActive: !selectedTemplate.isActive,
                      });
                      setStatus(r.ok ? 'Stav šablony upraven.' : r.error ?? 'Aktivace selhala.');
                      if (r.ok) await refresh();
                    }}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold"
                  >
                    {selectedTemplate.isActive ? 'Deaktivovat' : 'Aktivovat'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="flex-1 rounded-lg border border-zinc-200 p-2 text-sm"
                    placeholder="test@example.com"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await nestAdminSendTemplateTest(token, selectedTemplate.id, testEmail.trim());
                      setStatus(r.ok ? 'Test e-mail byl odeslán.' : r.error ?? 'Test selhal.');
                      if (r.ok) await refresh();
                    }}
                    className="rounded-lg border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-700"
                  >
                    Poslat test
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Newslettery / reklamní kampaně</h2>
            <div className="mt-3 space-y-2">
              <input
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 p-2 text-sm"
                placeholder="Název kampaně"
              />
              <input
                value={campaignSubject}
                onChange={(e) => setCampaignSubject(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 p-2 text-sm"
                placeholder="Předmět e-mailu"
              />
              <textarea
                value={campaignHtml}
                onChange={(e) => setCampaignHtml(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-zinc-200 p-2 text-xs"
                placeholder="HTML obsah"
              />
              <button
                type="button"
                onClick={async () => {
                  const r = await nestAdminCreateEmailCampaign(token, {
                    type: 'newsletter',
                    title: campaignTitle,
                    subject: campaignSubject,
                    htmlContent: campaignHtml,
                    templateKey: 'newsletter',
                  });
                  setStatus(r.ok ? 'Kampaň vytvořena.' : r.error ?? 'Vytvoření kampaně selhalo.');
                  if (r.ok) {
                    setCampaignTitle('');
                    setCampaignSubject('');
                    await refresh();
                  }
                }}
                className="rounded-lg bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-sm font-semibold text-white"
              >
                Vytvořit kampaň
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                  <p className="font-semibold">{c.title}</p>
                  <p className="text-zinc-600">{c.subject}</p>
                  <p className="text-xs text-zinc-500">{c.type} · {c.status}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
