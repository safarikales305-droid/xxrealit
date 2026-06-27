'use client';

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

const CATEGORY_LABEL: Record<string, string> = {
  system: 'Systémové',
  worker_crm: 'CRM pracovníků',
  marketing: 'Marketing',
  communication: 'Komunikace',
};

function renderPreview(html: string, variables: string[]): string {
  let out = html;
  for (const v of variables) {
    out = out.replaceAll(`{{${v}}}`, `[${v}]`);
  }
  return out;
}

export function AdminEmailsHub() {
  const { user, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [logs, setLogs] = useState<NestEmailLogRow[]>([]);
  const [templates, setTemplates] = useState<NestEmailTemplateRow[]>([]);
  const [campaigns, setCampaigns] = useState<NestEmailCampaignRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [tab, setTab] = useState<'templates' | 'history' | 'campaigns'>('templates');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignSubject, setCampaignSubject] = useState('');
  const [campaignHtml, setCampaignHtml] = useState('<p>Obsah newsletteru...</p>');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const selectedLog = useMemo(
    () => logs.find((l) => l.id === selectedLogId) ?? null,
    [logs, selectedLogId],
  );

  const templateVariables = useMemo(() => {
    const t = selectedTemplate as NestEmailTemplateRow & { variables?: string[] };
    return t?.variables ?? [];
  }, [selectedTemplate]);

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
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role]);

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Centrum e-mailů</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Jednotná správa všech e-mailových šablon odesílaných z portálu XXrealit.
        </p>
      </div>

      {status ? (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">{status}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(['templates', 'history', 'campaigns'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === t ? 'bg-[#e85d00] text-white' : 'border border-zinc-200 bg-white'
            }`}
          >
            {t === 'templates' ? 'Šablony' : t === 'history' ? 'Historie' : 'Kampaně'}
          </button>
        ))}
      </div>

      {tab === 'templates' ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Šablony e-mailů</h2>
            <select
              className="mt-3 w-full rounded-lg border border-zinc-200 p-2 text-sm"
              value={selectedTemplateId ?? ''}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              {templates.map((t) => {
                const cat = (t as NestEmailTemplateRow & { category?: string }).category;
                return (
                  <option key={t.id} value={t.id}>
                    {t.key} — {t.name}
                    {cat ? ` (${CATEGORY_LABEL[cat] ?? cat})` : ''}
                  </option>
                );
              })}
            </select>
            {selectedTemplate ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-zinc-500">
                  Typ: <strong>{CATEGORY_LABEL[(selectedTemplate as { category?: string }).category ?? ''] ?? 'systémová'}</strong>
                  {' · '}
                  Klíč: <code>{selectedTemplate.key}</code>
                  {!selectedTemplate.isActive ? ' · neaktivní' : ''}
                </p>
                <input
                  value={selectedTemplate.name}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm"
                  placeholder="Název šablony"
                />
                <input
                  value={selectedTemplate.subject}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, subject: e.target.value } : x)),
                    )
                  }
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm"
                  placeholder="Předmět"
                />
                <textarea
                  value={selectedTemplate.htmlContent}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, htmlContent: e.target.value } : x)),
                    )
                  }
                  rows={10}
                  className="w-full rounded-lg border border-zinc-200 p-2 font-mono text-xs"
                  placeholder="HTML obsah"
                />
                <textarea
                  value={selectedTemplate.textContent}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, textContent: e.target.value } : x)),
                    )
                  }
                  rows={5}
                  className="w-full rounded-lg border border-zinc-200 p-2 font-mono text-xs"
                  placeholder="Textová verze"
                />
                {templateVariables.length > 0 ? (
                  <div className="rounded-lg bg-zinc-50 p-3 text-xs">
                    <p className="font-semibold text-zinc-700">Dostupné proměnné:</p>
                    <p className="mt-1 font-mono text-zinc-600">
                      {templateVariables.map((v) => `{{${v}}}`).join(' · ')}
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await nestAdminUpdateEmailTemplate(token, selectedTemplate.id, {
                        name: selectedTemplate.name,
                        subject: selectedTemplate.subject,
                        htmlContent: selectedTemplate.htmlContent,
                        textContent: selectedTemplate.textContent,
                        isActive: selectedTemplate.isActive,
                      });
                      setStatus(r.ok ? 'Šablona uložena.' : r.error ?? 'Uložení selhalo.');
                      if (r.ok) await refresh();
                    }}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Uložit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await nestAdminUpdateEmailTemplate(token, selectedTemplate.id, {
                        isActive: !selectedTemplate.isActive,
                      });
                      setStatus(r.ok ? 'Stav šablony upraven.' : r.error ?? 'Chyba');
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
                      setStatus(r.ok ? 'Test odeslán.' : r.error ?? 'Test selhal');
                      if (r.ok) await refresh();
                    }}
                    className="rounded-lg border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-700"
                  >
                    Testovací odeslání
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Náhled HTML</h2>
            {selectedTemplate ? (
              <div
                className="prose prose-sm mt-3 max-w-none rounded-lg border bg-zinc-50 p-4"
                dangerouslySetInnerHTML={{
                  __html: renderPreview(selectedTemplate.htmlContent, templateVariables),
                }}
              />
            ) : (
              <p className="mt-3 text-sm text-zinc-500">Vyberte šablonu.</p>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'campaigns' ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Newslettery / reklamní kampaně</h2>
          <p className="mt-1 text-sm text-zinc-600">Kampaně používají šablony newsletter nebo promo_campaign.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <input
              value={campaignTitle}
              onChange={(e) => setCampaignTitle(e.target.value)}
              className="rounded-lg border border-zinc-200 p-2 text-sm"
              placeholder="Název kampaně"
            />
            <input
              value={campaignSubject}
              onChange={(e) => setCampaignSubject(e.target.value)}
              className="rounded-lg border border-zinc-200 p-2 text-sm"
              placeholder="Předmět"
            />
          </div>
          <textarea
            value={campaignHtml}
            onChange={(e) => setCampaignHtml(e.target.value)}
            rows={8}
            className="mt-2 w-full rounded-lg border border-zinc-200 p-2 text-xs"
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
              setStatus(r.ok ? 'Kampaň vytvořena.' : r.error ?? 'Chyba');
              if (r.ok) {
                setCampaignTitle('');
                setCampaignSubject('');
                await refresh();
              }
            }}
            className="mt-3 rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
          >
            Vytvořit kampaň
          </button>
          <div className="mt-4 space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                <p className="font-semibold">{c.title}</p>
                <p className="text-zinc-600">{c.subject}</p>
                <p className="text-xs text-zinc-500">
                  {c.type} · {c.status} · šablona {c.templateKey ?? '—'}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Historie odeslaných e-mailů</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="py-2">ID</th>
                    <th>Typ</th>
                    <th>Příjemce</th>
                    <th>Předmět</th>
                    <th>Stav</th>
                    <th>Šablona</th>
                    <th>Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className={`cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 ${
                        selectedLogId === log.id ? 'bg-orange-50' : ''
                      }`}
                      onClick={() => setSelectedLogId(log.id)}
                    >
                      <td className="py-2 font-mono text-xs">{log.id.slice(0, 8)}…</td>
                      <td>{log.type}</td>
                      <td>{log.recipientEmail}</td>
                      <td className="max-w-[160px] truncate">{log.subject}</td>
                      <td>{log.status}</td>
                      <td>{log.templateKey ?? '—'}</td>
                      <td>{new Date(log.createdAt).toLocaleString('cs-CZ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
            <h2 className="font-semibold">Detail e-mailu</h2>
            {selectedLog ? (
              <dl className="mt-3 space-y-2">
                <div>
                  <dt className="text-xs text-zinc-500">ID</dt>
                  <dd className="font-mono text-xs break-all">{selectedLog.id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Typ / šablona</dt>
                  <dd>
                    {selectedLog.type} · {selectedLog.templateKey ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Příjemce</dt>
                  <dd>{selectedLog.recipientEmail}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Předmět</dt>
                  <dd>{selectedLog.subject}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Stav</dt>
                  <dd>{selectedLog.status}</dd>
                </div>
                {selectedLog.errorMessage ? (
                  <div>
                    <dt className="text-xs text-red-600">Chyba</dt>
                    <dd className="text-red-700">{selectedLog.errorMessage}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-zinc-500">Odesláno</dt>
                  <dd>
                    {selectedLog.sentAt
                      ? new Date(selectedLog.sentAt).toLocaleString('cs-CZ')
                      : new Date(selectedLog.createdAt).toLocaleString('cs-CZ')}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-zinc-500">Klikněte na řádek v tabulce.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
