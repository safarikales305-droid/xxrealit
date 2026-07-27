'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCreateEmailCampaign,
  nestAdminEmailCampaigns,
  nestAdminSendTemplateTest,
  type NestEmailCampaignRow,
} from '@/lib/nest-client';
import {
  nestEmailCenterAiSales,
  nestEmailCenterDiagnostics,
  nestEmailCenterInbound,
  nestEmailCenterLogs,
  nestEmailCenterOverview,
  nestEmailCenterReplyToOptions,
  nestEmailCenterSendTest,
  nestEmailCenterSenders,
  nestEmailCenterSignatures,
  nestEmailCenterTemplates,
  nestEmailCenterUpdateSettings,
  nestEmailCenterUpdateTemplate,
  type EmailCenterSettings,
  type EmailInboundRow,
  type EmailLogRow,
  type EmailSenderRow,
  type EmailSignatureRow,
} from '@/lib/email-center-admin-api';
import { ButtonSpinner, InlineLoadingState, PageLoadingState } from '@/components/admin/loading/AdminLoadingSpinner';
import { useAdminLoading } from '@/components/admin/loading/AdminLoadingProvider';

const TABS = [
  'overview',
  'addresses',
  'senders',
  'reply-to',
  'signatures',
  'footer',
  'templates',
  'ai-sales',
  'auto',
  'inbound',
  'sent',
  'diagnostics',
  'test',
] as const;

type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Přehled',
  addresses: 'Nastavení adres',
  senders: 'Odesílatelé',
  'reply-to': 'Reply-To',
  signatures: 'Podpisy',
  footer: 'Patička',
  templates: 'Šablony',
  'ai-sales': 'AI obchodník',
  auto: 'Automatické e-maily',
  inbound: 'Příchozí odpovědi',
  sent: 'Odeslané e-maily',
  diagnostics: 'Diagnostika',
  test: 'Test',
};

const ADDRESS_FIELDS: Array<{ key: keyof EmailCenterSettings; label: string; usage: string }> = [
  { key: 'defaultSenderName', label: 'Výchozí odesílatel — název', usage: 'Systémové e-maily' },
  { key: 'defaultSenderEmail', label: 'Výchozí odesílatel — e-mail', usage: 'Systémové e-maily' },
  { key: 'salesSenderName', label: 'Obchodní odesílatel — název', usage: 'AI obchodník' },
  { key: 'salesSenderEmail', label: 'Obchodní odesílatel — e-mail', usage: 'AI obchodník' },
  { key: 'salesReplyToEmail', label: 'Reply-To pro AI obchodníka', usage: 'Hlavička Reply-To nabídek' },
  { key: 'supportEmail', label: 'E-mail podpory', usage: 'Podpora, tickety' },
  { key: 'footerContactEmail', label: 'E-mail v patičce', usage: 'Všechny šablony a nabídky' },
  { key: 'billingEmail', label: 'Fakturační e-mail', usage: 'Fakturace' },
  { key: 'registrationEmail', label: 'E-mail pro registrace', usage: 'Registrace' },
  { key: 'systemNotificationEmail', label: 'Systémové notifikace', usage: 'Notifikace' },
  { key: 'leadEmail', label: 'E-mail pro leady', usage: 'Leady z inzerátů' },
  { key: 'contactFormEmail', label: 'Kontaktní formuláře', usage: 'Formuláře' },
];

function renderPreview(html: string, variables: string[]): string {
  let out = html;
  for (const v of variables) {
    out = out.replaceAll(`{{${v}}}`, `[${v}]`);
  }
  return out;
}

export function EmailCenterHub() {
  const { user, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const { startLoading, stopLoading } = useAdminLoading();

  const [tab, setTab] = useState<Tab>('overview');
  const [settings, setSettings] = useState<EmailCenterSettings | null>(null);
  const [senders, setSenders] = useState<EmailSenderRow[]>([]);
  const [signatures, setSignatures] = useState<EmailSignatureRow[]>([]);
  const [templates, setTemplates] = useState<
    Array<{ id: string; key: string; name: string; subject: string; htmlContent: string; textContent: string; isActive: boolean; variables?: string[] }>
  >([]);
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [inbound, setInbound] = useState<EmailInboundRow[]>([]);
  const [campaigns, setCampaigns] = useState<NestEmailCampaignRow[]>([]);
  const [aiConfig, setAiConfig] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [replyToOptions, setReplyToOptions] = useState<Array<{ value: string; label: string; email: string }>>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [provider, setProvider] = useState<{ provider: string; apiKeyConfigured: boolean } | null>(null);

  const [pageLoading, setPageLoading] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testSenderType, setTestSenderType] = useState<'sales' | 'default'>('sales');
  const [testReplyTo, setTestReplyTo] = useState('');
  const [testSignatureId, setTestSignatureId] = useState('');
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    setError(null);
    const slowTimer = window.setTimeout(() => setSlowLoad(true), 10_000);
    try {
      const [overview, senderRows, sigRows, tplRows, logRows, inboundRows, campRows] = await Promise.all([
        nestEmailCenterOverview(token),
        nestEmailCenterSenders(token),
        nestEmailCenterSignatures(token),
        nestEmailCenterTemplates(token),
        nestEmailCenterLogs(token),
        nestEmailCenterInbound(token),
        nestAdminEmailCampaigns(token),
      ]);

      if (overview.ok) {
        setSettings(overview.data.settings);
        setProvider(overview.data.provider);
        setCounts(overview.data.counts);
      }
      if (senderRows.ok) setSenders(senderRows.data);
      if (sigRows.ok) setSignatures(sigRows.data);
      if (tplRows.ok) {
        setTemplates(tplRows.data);
        if (!selectedTemplateId && tplRows.data[0]) setSelectedTemplateId(tplRows.data[0].id);
      }
      if (logRows.ok) setLogs(logRows.data);
      if (inboundRows.ok) setInbound(inboundRows.data);
      setCampaigns(campRows ?? []);

      if (tab === 'ai-sales') {
        const ai = await nestEmailCenterAiSales(token);
        if (ai.ok) setAiConfig(ai.data);
      }
      if (tab === 'diagnostics') {
        const d = await nestEmailCenterDiagnostics(token);
        if (d.ok) setDiagnostics(d.data);
      }
      if (tab === 'reply-to' || tab === 'test') {
        const opts = await nestEmailCenterReplyToOptions(token);
        if (opts.ok) setReplyToOptions(opts.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Načtení selhalo');
    } finally {
      window.clearTimeout(slowTimer);
      setSlowLoad(false);
      setPageLoading(false);
    }
  }, [token, tab, selectedTemplateId]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, tab, refresh]);

  async function saveSettings(patch: Partial<EmailCenterSettings>) {
    if (!token || !settings) return;
    setSaving(true);
    startLoading({ key: 'email-center-save', label: 'Ukládám nastavení e-mailů…' });
    try {
      const r = await nestEmailCenterUpdateSettings(token, { ...settings, ...patch });
      if (!r.ok) setError(r.error);
      else {
        setSettings(r.data.settings);
        setStatus('Nastavení uloženo.');
      }
    } finally {
      setSaving(false);
      stopLoading('email-center-save');
    }
  }

  async function runCenterTest() {
    if (!token || !testEmail.trim()) return;
    startLoading({ key: 'email-center-test', label: 'Odesílám testovací e-mail…' });
    try {
      const r = await nestEmailCenterSendTest(token, {
        toEmail: testEmail.trim(),
        senderType: testSenderType,
        replyTo: testReplyTo || undefined,
        signatureId: testSignatureId || undefined,
        templateId: selectedTemplateId ?? undefined,
      });
      if (!r.ok) setError(r.error);
      else {
        setTestResult(r.data);
        setStatus('Testovací e-mail odeslán.');
        await refresh();
      }
    } finally {
      stopLoading('email-center-test');
    }
  }

  if (!token || user?.role !== 'ADMIN') return null;

  if (pageLoading && !settings) {
    return <PageLoadingState label="Načítám nastavení e-mailů…" slow={slowLoad} onRetry={() => void refresh()} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">E-mail centrum</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Centrální správa odesílatelů, Reply-To, patiček, podpisů, šablon a diagnostiky portálu XXREALIT.
        </p>
      </div>

      {status ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{status}</p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm ${
              tab === t ? 'bg-[#e85d00] text-white' : 'border border-zinc-200 bg-white'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ['Aktivní odesílatelé', counts.senders ?? 0],
            ['Podpisy', counts.signatures ?? 0],
            ['Šablony', counts.templates ?? 0],
            ['Odesláno dnes', counts.logsToday ?? 0],
            ['Nové odpovědi', counts.inboundNew ?? 0],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900">{val}</p>
            </div>
          ))}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm md:col-span-2">
            <p className="text-sm font-semibold">Provider</p>
            <p className="mt-1 text-sm text-zinc-600">
              {provider?.provider ?? '—'} · API klíč: {provider?.apiKeyConfigured ? 'ano' : 'ne'}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Obchodní odesílatel: {settings?.salesSenderEmail} · Reply-To: {settings?.salesReplyToEmail}
            </p>
          </div>
        </section>
      ) : null}

      {(tab === 'addresses' || tab === 'footer' || tab === 'reply-to') && settings ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">
            {tab === 'footer' ? 'E-mail v patičce' : tab === 'reply-to' ? 'Reply-To' : 'Nastavení adres'}
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(tab === 'footer'
              ? ADDRESS_FIELDS.filter((f) => f.key === 'footerContactEmail')
              : tab === 'reply-to'
                ? ADDRESS_FIELDS.filter((f) => f.key === 'salesReplyToEmail' || f.key === 'defaultReplyToEmail')
                : ADDRESS_FIELDS
            ).map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="font-medium">{field.label}</span>
                <span className="ml-2 text-xs text-zinc-400">({field.usage})</span>
                <input
                  value={String(settings[field.key] ?? '')}
                  onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-200 p-2 text-sm"
                />
              </label>
            ))}
          </div>
          {tab === 'reply-to' && replyToOptions.length > 0 ? (
            <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm">
              <p className="font-semibold">Schválené Reply-To adresy v systému</p>
              <ul className="mt-2 space-y-1">
                {replyToOptions.map((o) => (
                  <li key={o.email} className="font-mono text-xs">
                    {o.label}: {o.email}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {tab === 'footer' ? (
            <p className="mt-3 text-sm text-zinc-600">
              Proměnná <code>{'{{footerContactEmail}}'}</code> se naplní hodnotou{' '}
              <strong>{settings.footerContactEmail}</strong> ve všech e-mailech.
            </p>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSettings(settings)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <ButtonSpinner /> : null}
            {saving ? 'Ukládám…' : 'Uložit nastavení'}
          </button>
        </section>
      ) : null}

      {tab === 'senders' ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Odesílatelé a domény</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="py-2">Název</th>
                  <th>E-mail</th>
                  <th>Doména</th>
                  <th>Účel</th>
                  <th>Ověřen</th>
                  <th>Aktivní</th>
                  <th>Poslední test</th>
                </tr>
              </thead>
              <tbody>
                {senders.map((s) => (
                  <tr key={s.id} className="border-t border-zinc-100">
                    <td className="py-2">{s.name}</td>
                    <td className="font-mono text-xs">{s.email}</td>
                    <td>{s.domain}</td>
                    <td>{s.usage ?? s.purpose}</td>
                    <td>{s.verified ? 'ano' : 'ne'}</td>
                    <td>{s.active ? 'ano' : 'ne'}</td>
                    <td className="text-xs">
                      {s.lastTestAt ? new Date(s.lastTestAt).toLocaleString('cs-CZ') : '—'}
                      {s.lastTestSuccess === false ? ' (selhalo)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Provider: RESEND · API klíč v Railway env · hesla se nezobrazují.
          </p>
        </section>
      ) : null}

      {tab === 'signatures' ? (
        <section className="space-y-3">
          {signatures.map((sig) => (
            <div key={sig.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="font-semibold">
                {sig.name} <span className="text-xs text-zinc-500">({sig.type})</span>
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {sig.personName} · {sig.team} · {sig.email}
              </p>
              <div className="prose prose-sm mt-3 max-w-none rounded border bg-zinc-50 p-3" dangerouslySetInnerHTML={{ __html: sig.html }} />
            </div>
          ))}
        </section>
      ) : null}

      {tab === 'templates' ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Šablony e-mailů</h2>
            <select
              className="mt-3 w-full rounded-lg border border-zinc-200 p-2 text-sm"
              value={selectedTemplateId ?? ''}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key} — {t.name}
                </option>
              ))}
            </select>
            {selectedTemplate ? (
              <div className="mt-3 space-y-2">
                <input
                  value={selectedTemplate.name}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm"
                />
                <input
                  value={selectedTemplate.subject}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, subject: e.target.value } : x)),
                    )
                  }
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm"
                />
                <textarea
                  value={selectedTemplate.htmlContent}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === selectedTemplate.id ? { ...x, htmlContent: e.target.value } : x)),
                    )
                  }
                  rows={8}
                  className="w-full rounded-lg border border-zinc-200 p-2 font-mono text-xs"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    if (!token) return;
                    setSaving(true);
                    startLoading({ key: 'tpl-save', label: 'Ukládám šablonu…' });
                    try {
                      const r = await nestEmailCenterUpdateTemplate(token, selectedTemplate.id, {
                        name: selectedTemplate.name,
                        subject: selectedTemplate.subject,
                        htmlContent: selectedTemplate.htmlContent,
                        textContent: selectedTemplate.textContent,
                        isActive: selectedTemplate.isActive,
                      });
                      setStatus(r.ok ? 'Šablona uložena.' : r.error ?? 'Chyba');
                    } finally {
                      setSaving(false);
                      stopLoading('tpl-save');
                    }
                  }}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Uložit šablonu
                </button>
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Náhled HTML</h2>
            {selectedTemplate ? (
              <div
                className="prose prose-sm mt-3 max-w-none rounded-lg border bg-zinc-50 p-4"
                dangerouslySetInnerHTML={{
                  __html: renderPreview(selectedTemplate.htmlContent, selectedTemplate.variables ?? []),
                }}
              />
            ) : (
              <p className="mt-3 text-sm text-zinc-500">Vyberte šablonu.</p>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'ai-sales' && aiConfig ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">AI obchodník — e-mailová konfigurace</h2>
          <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <div>
              <dt className="text-zinc-500">Odesílatel</dt>
              <dd>{String((aiConfig.sender as { name?: string })?.name)} &lt;{String((aiConfig.sender as { email?: string })?.email)}&gt;</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Reply-To</dt>
              <dd className="font-mono">{String(aiConfig.replyTo)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Patička</dt>
              <dd className="font-mono">{String(aiConfig.footerContactEmail)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Testovací režim</dt>
              <dd>{aiConfig.testModeEnabled ? 'zapnuto' : 'vypnuto'}</dd>
            </div>
          </dl>
          <Link
            href="/admin/marketing/ai-sales"
            className="mt-4 inline-block rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Otevřít AI obchodníka
          </Link>
        </section>
      ) : null}

      {tab === 'auto' ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Automatické e-maily</h2>
          <p className="mt-1 text-sm text-zinc-600">Systémové šablony (registrace, reset hesla, leady…) spravujte v záložce Šablony.</p>
          <p className="mt-3 text-sm">Aktivních šablon: <strong>{counts.templates ?? 0}</strong></p>
        </section>
      ) : null}

      {tab === 'inbound' ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Příchozí odpovědi</h2>
          {inbound.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Zatím žádné zaznamenané odpovědi.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="py-2">Datum</th>
                    <th>Od</th>
                    <th>Reply-To</th>
                    <th>Předmět</th>
                    <th>Stav</th>
                    <th>Nabídka</th>
                  </tr>
                </thead>
                <tbody>
                  {inbound.map((row) => (
                    <tr key={row.id} className="border-t border-zinc-100">
                      <td className="py-2">{new Date(row.receivedAt).toLocaleString('cs-CZ')}</td>
                      <td>{row.fromEmail}</td>
                      <td className="font-mono text-xs">{row.replyToEmail ?? '—'}</td>
                      <td className="max-w-[200px] truncate">{row.subject}</td>
                      <td>{row.status}</td>
                      <td className="font-mono text-xs">{row.aiSalesMessageId?.slice(0, 8) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'sent' ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Odeslané e-maily</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="py-2">Datum</th>
                  <th>Typ</th>
                  <th>Příjemce</th>
                  <th>Reply-To</th>
                  <th>Předmět</th>
                  <th>Stav</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-zinc-100">
                    <td className="py-2">{new Date(log.createdAt).toLocaleString('cs-CZ')}</td>
                    <td>{log.type}</td>
                    <td>{log.recipientEmail}</td>
                    <td className="font-mono text-xs">{log.replyToEmail ?? '—'}</td>
                    <td className="max-w-[160px] truncate">{log.subject}</td>
                    <td>{log.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'diagnostics' && diagnostics ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm text-sm">
          <h2 className="text-lg font-semibold">Diagnostika</h2>
          <pre className="mt-3 overflow-auto rounded bg-zinc-50 p-3 text-xs">{JSON.stringify(diagnostics, null, 2)}</pre>
        </section>
      ) : null}

      {tab === 'test' ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Test e-mailového centra</h2>
            <div className="mt-3 space-y-3 text-sm">
              <label className="block">
                Testovací e-mail
                <input
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 p-2"
                  placeholder="test@example.com"
                />
              </label>
              <label className="block">
                Odesílatel
                <select
                  value={testSenderType}
                  onChange={(e) => setTestSenderType(e.target.value as 'sales' | 'default')}
                  className="mt-1 w-full rounded-lg border border-zinc-200 p-2"
                >
                  <option value="sales">Obchodní tým</option>
                  <option value="default">Výchozí</option>
                </select>
              </label>
              <label className="block">
                Reply-To
                <select
                  value={testReplyTo}
                  onChange={(e) => setTestReplyTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 p-2"
                >
                  <option value="">Výchozí z centra</option>
                  {replyToOptions.map((o) => (
                    <option key={o.email} value={o.email}>
                      {o.label} ({o.email})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Podpis
                <select
                  value={testSignatureId}
                  onChange={(e) => setTestSignatureId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 p-2"
                >
                  <option value="">Výchozí obchodní</option>
                  {signatures.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void runCenterTest()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#e85d00] px-4 py-2 font-semibold text-white"
              >
                Odeslat test
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm text-sm">
            <h2 className="text-lg font-semibold">Náhled / výsledek</h2>
            <div className="mt-3 space-y-1 rounded-lg bg-zinc-50 p-3">
              <p>
                <strong>Od:</strong> {settings?.salesSenderName} &lt;{settings?.salesSenderEmail}&gt;
              </p>
              <p>
                <strong>Odpovědět na:</strong> {testReplyTo || settings?.salesReplyToEmail}
              </p>
              <p>
                <strong>Patička:</strong> {settings?.footerContactEmail}
              </p>
              <p>
                <strong>Předmět:</strong> [TEST] XXREALIT – ověření e-mailového centra
              </p>
            </div>
            {testResult ? (
              <pre className="mt-3 overflow-auto rounded border bg-white p-3 text-xs">{JSON.stringify(testResult, null, 2)}</pre>
            ) : null}
          </div>
        </section>
      ) : null}

      {pageLoading ? <InlineLoadingState label="Obnovuji data…" className="py-2" /> : null}
    </div>
  );
}
