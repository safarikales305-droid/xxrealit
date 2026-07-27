'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  approveMessage,
  analyzeProspect,
  approveProspect,
  createProspect,
  generateOffer,
  generateManualMessage,
  getDashboard,
  getDiagnostics,
  getOpenAiDiagnostics,
  getSettings,
  importPreview,
  importProspects,
  listMessages,
  listProspects,
  listPrompts,
  listKnowledge,
  listSearchProviders,
  listReplies,
  markDoNotContact,
  testSearchProvider,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPES,
  rejectMessage,
  sendMessage,
  updateMessage,
  updateSettings,
  type AiSalesDashboard,
  type AiSalesMessage,
  type AiSalesProspect,
  type AiSalesSearchProviderInfo,
  type AiSalesApiError,
} from '@/lib/ai-sales-admin-api';
import { API_BASE_URL } from '@/lib/api';
import { AiSalesMessageEditorPanel } from '@/components/admin/ai-sales/AiSalesMessageEditorPanel';
import { AiSalesSearchPanel } from '@/components/admin/ai-sales/AiSalesSearchPanel';
import { AiSalesTestPanel } from '@/components/admin/ai-sales/AiSalesTestPanel';
import { AiSalesCrmPanel } from '@/components/admin/ai-sales/AiSalesCrmPanel';
import { AiSalesStatsPanel } from '@/components/admin/ai-sales/AiSalesStatsPanel';
import { AiSalesFollowUpPanel } from '@/components/admin/ai-sales/AiSalesFollowUpPanel';
import { AiSalesPromptsPanel } from '@/components/admin/ai-sales/AiSalesPromptsPanel';
import { AiSalesKnowledgePanel } from '@/components/admin/ai-sales/AiSalesKnowledgePanel';
import { useAdminLoading } from '@/components/admin/loading/AdminLoadingProvider';

const ANALYSIS_PHASES = [
  'Načítám veřejná data…',
  'Připravuji podklady…',
  'Volám OpenAI…',
  'Vyhodnocuji výsledek…',
  'Ukládám analýzu…',
];

function prospectContactSummary(p: AiSalesProspect) {
  const emails = p.publicContacts?.filter((c) => c.type === 'EMAIL') ?? [];
  const phones = p.publicContacts?.filter((c) => c.type === 'PHONE') ?? [];
  const primary =
    p.primaryEmail ??
    p.email ??
    emails.find((e) => e.isPrimary)?.value ??
    emails.find((e) => e.isSelectedForOutreach)?.value ??
    emails[0]?.value ??
    null;
  return { emails, phones, primary };
}

type Tab =
  | 'overview'
  | 'crm'
  | 'prospects'
  | 'search'
  | 'approval'
  | 'sent'
  | 'replies'
  | 'followup'
  | 'campaigns'
  | 'prompts'
  | 'knowledge'
  | 'settings'
  | 'stats'
  | 'test'
  | 'message';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Přehled' },
  { id: 'crm', label: 'CRM' },
  { id: 'prospects', label: 'Potenciální partneři' },
  { id: 'search', label: 'Vyhledávání' },
  { id: 'approval', label: 'Nabídky ke schválení' },
  { id: 'sent', label: 'Odeslané nabídky' },
  { id: 'replies', label: 'Odpovědi' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'campaigns', label: 'Kampaně' },
  { id: 'prompts', label: 'Prompty' },
  { id: 'knowledge', label: 'Znalosti' },
  { id: 'settings', label: 'Nastavení' },
  { id: 'stats', label: 'Statistiky' },
  { id: 'test', label: 'Test' },
];

export default function AdminAiSalesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const { startLoading, updateLoading, stopLoading } = useAdminLoading();
  const [tab, setTab] = useState<Tab>('overview');
  const [periodDays, setPeriodDays] = useState(7);
  const [dashboard, setDashboard] = useState<AiSalesDashboard | null>(null);
  const [prospects, setProspects] = useState<AiSalesProspect[]>([]);
  const [messages, setMessages] = useState<AiSalesMessage[]>([]);
  const [replies, setReplies] = useState<Array<Record<string, unknown>>>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<(AiSalesApiError & { message: string }) | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<AiSalesMessage | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editContent, setEditContent] = useState('');

  const [newProspect, setNewProspect] = useState({
    partnerType: 'REAL_ESTATE_AGENCY',
    companyName: '',
    contactName: '',
    email: '',
    city: '',
    region: '',
    website: '',
    publicInfo: '',
    source: 'MANUAL',
  });

  const [csvText, setCsvText] = useState('');
  const [importPreviewData, setImportPreviewData] = useState<Record<string, unknown> | null>(null);
  const [prompts, setPrompts] = useState<Array<Record<string, unknown>>>([]);
  const [knowledge, setKnowledge] = useState<Array<Record<string, unknown>>>([]);
  const [providers, setProviders] = useState<Array<Record<string, unknown>>>([]);
  const [searchProviders, setSearchProviders] = useState<AiSalesSearchProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerTestMessage, setProviderTestMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    setError(null);
    setPageLoading(true);
    try {
      const [d, p, pending, sent, r, s] = await Promise.allSettled([
        getDashboard(token, periodDays),
        listProspects(token),
        listMessages(token, 'PENDING_APPROVAL'),
        listMessages(token, 'SENT'),
        listReplies(token),
        getSettings(token),
      ]);
      if (d.status === 'fulfilled') setDashboard(d.value);
      if (p.status === 'fulfilled') setProspects(p.value);
      if (pending.status === 'fulfilled') setMessages(pending.value);
      else if (sent.status === 'fulfilled' && tab === 'sent') setMessages(sent.value);
      if (r.status === 'fulfilled') setReplies(r.value);
      if (s.status === 'fulfilled') setSettings(s.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Načtení selhalo.');
    } finally {
      setPageLoading(false);
    }
  }, [token, periodDays, tab]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const messageId = searchParams.get('messageId');
    if (tabParam) setTab(tabParam as Tab);
    if (messageId) setSelectedMessageId(messageId);
  }, [searchParams]);

  const openMessage = useCallback((messageId: string) => {
    setSelectedMessageId(messageId);
    setTab('message');
    router.replace(`/admin/marketing/ai-sales?tab=message&messageId=${messageId}`);
  }, [router]);

  const loadSearchProviders = useCallback(async () => {
    if (!token) return;
    setProvidersLoading(true);
    setProviderTestMessage(null);
    try {
      const [p, d] = await Promise.all([listSearchProviders(token), getDiagnostics(token)]);
      setSearchProviders(p.providers ?? []);
      setProviders(p.legacy ?? []);
      setDiagnostics(d);
    } catch (e) {
      setProviders([]);
      setSearchProviders([]);
      setDiagnostics(null);
      setError(e instanceof Error ? e.message : 'Načtení providerů selhalo.');
    } finally {
      setProvidersLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (tab === 'approval') {
      void listMessages(token, 'PENDING_APPROVAL').then(setMessages).catch(() => setMessages([]));
    } else if (tab === 'sent') {
      void listMessages(token, 'SENT').then(setMessages).catch(() => setMessages([]));
    } else if (tab === 'prompts') {
      void listPrompts(token).then(setPrompts).catch(() => setPrompts([]));
    } else if (tab === 'knowledge') {
      void listKnowledge(token).then(setKnowledge).catch(() => setKnowledge([]));
    } else if (tab === 'settings') {
      void loadSearchProviders();
    }
  }, [tab, token, loadSearchProviders]);

  async function handleCreateProspect() {
    if (!token) return;
    setBusy(true);
    try {
      await createProspect(token, newProspect);
      setNewProspect({ ...newProspect, companyName: '', contactName: '', email: '', publicInfo: '' });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vytvoření selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyze(id: string) {
    if (!token) return;
    setBusy(true);
    setActionError(null);
    const key = `analyze-${id}`;
    startLoading({ key, label: 'Analyzuji partnera…', sublabel: ANALYSIS_PHASES[0] });
    let phaseIdx = 0;
    const timer = setInterval(() => {
      phaseIdx = Math.min(phaseIdx + 1, ANALYSIS_PHASES.length - 1);
      updateLoading({ key, sublabel: ANALYSIS_PHASES[phaseIdx] });
    }, 3500);
    try {
      await analyzeProspect(token, id);
      await refresh();
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setActionError({
        message: err.message || 'Analýzu se nepodařilo dokončit.',
        code: err.code ?? 'UNKNOWN_ERROR',
        httpStatus: err.httpStatus ?? 503,
        success: false,
        phase: err.phase ?? 'analysis',
      });
    } finally {
      clearInterval(timer);
      stopLoading(key);
      setBusy(false);
    }
  }

  async function handleGenerate(id: string) {
    if (!token) return;
    setBusy(true);
    setActionError(null);
    setSelectedMessageId(null);
    const key = `offer-${id}`;
    startLoading({ key, label: 'Vytvářím nabídku…', sublabel: 'Kontroluji analýzu partnera…' });
    try {
      const res = await generateOffer(token, id, { variantCount: 3 });
      const firstId = res.messageId ?? res.variants?.[0]?.messageId;
      if (firstId) {
        openMessage(firstId);
      }
      await refresh();
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setActionError({
        message: err.message || 'Vytvoření nabídky selhalo.',
        code: err.code ?? 'UNKNOWN_ERROR',
        httpStatus: err.httpStatus ?? 500,
        success: false,
        phase: err.phase ?? 'generate_offer',
      });
    } finally {
      stopLoading(key);
      setBusy(false);
    }
  }

  async function handleApproveSend(id: string) {
    if (!token) return;
    setBusy(true);
    try {
      await approveMessage(token, id);
      await sendMessage(token, id);
      await refresh();
      setSelectedMsg(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Odeslání selhalo — zkontrolujte schválení a testovací režim.');
    } finally {
      setBusy(false);
    }
  }

  if (!token || user?.role !== 'ADMIN') return null;

  const activeWeb = (diagnostics?.aiSales as { activeWebProvider?: { name?: string; envVar?: string } } | undefined)?.activeWebProvider;
  const deployment = diagnostics?.deployment as {
    environment?: string;
    serviceName?: string | null;
    deploymentId?: string | null;
    applicationVersion?: string | null;
    serpApiConfigured?: boolean;
    serpApiKeyLength?: number;
    serpApiKeyMasked?: string | null;
  } | undefined;

  async function handleTestProvider(id: 'SERPAPI' | 'BING') {
    if (!token) return;
    setProviderTestMessage(null);
    setBusy(true);
    try {
      const res = await testSearchProvider(token, id === 'SERPAPI' ? 'SERPAPI' : 'BING_WEB_SEARCH') as {
        resultCount?: number;
        count?: number;
      };
      const count = res.resultCount ?? res.count ?? 0;
      setProviderTestMessage(
        id === 'SERPAPI'
          ? `SerpAPI je správně připojeno. Nalezeno ${count} testovacích výsledků.`
          : `Bing je správně připojeno. Nalezeno ${count} testovacích výsledků.`,
      );
      await loadSearchProviders();
    } catch (e) {
      setProviderTestMessage(e instanceof Error ? e.message : 'Test providera selhal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        <Link href="/admin/marketing/ai-centrum" className="text-orange-600 underline">← AI centrum</Link>
        {' · '}AI obchodník pro akvizici partnerů XXREALIT. První e-mail vždy vyžaduje schválení administrátora.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.id ? 'bg-orange-600 text-white' : 'border border-zinc-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void refresh()}>Načíst znovu</button>
        </div>
      ) : null}

      {pageLoading && tab === 'overview' && !dashboard ? (
        <p className="text-sm text-zinc-500">Načítám přehled…</p>
      ) : null}

      {tab === 'overview' && dashboard ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[1, 7, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPeriodDays(d)}
                className={`rounded border px-2 py-1 text-xs ${periodDays === d ? 'border-orange-500 bg-orange-50' : ''}`}
              >
                {d === 1 ? 'Dnes' : `${d} dní`}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Nové kontakty" value={dashboard.newProspects} />
            <Stat label="Analyzováno" value={dashboard.analyzedProspects ?? 0} />
            <Stat label="Průměrný fit score" value={dashboard.avgFitScore ?? 0} />
            <Stat label="Čeká na kontrolu" value={dashboard.needsReview} />
            <Stat label="Ke schválení" value={dashboard.pendingApproval} />
            <Stat label="Nalezeno ve vyhledávání" value={dashboard.foundInSearch ?? 0} />
            <Stat label="Odesláno dnes" value={dashboard.sentToday} />
            <Stat label="Odpovědi dnes" value={dashboard.repliesToday} />
            <Stat label="Pozitivní odpovědi" value={dashboard.positiveReplies} />
            <Stat label="Odmítnutí" value={dashboard.rejections} />
            <Stat label="Bez odpovědi" value={dashboard.noResponse} />
            <Stat label="Follow-upy" value={dashboard.scheduledFollowUps} />
            <Stat label="Konverze" value={dashboard.conversions} />
            <Stat label="Nové kanceláře" value={dashboard.newAgencies ?? 0} />
            <Stat label="Noví makléři" value={dashboard.newAgents ?? 0} />
            <Stat label="Stavební firmy" value={dashboard.newConstruction ?? 0} />
            <Stat label="Leady" value={dashboard.leads} />
            <Stat label="Konverzní poměr %" value={dashboard.conversionRate} />
            <Stat label="Náklady AI (Kč)" value={dashboard.aiCostCzk} />
            <Stat label="Kč / lead" value={dashboard.costPerLead} />
          </div>
        </div>
      ) : null}

      {tab === 'crm' ? (
        <AiSalesCrmPanel
          token={token}
          initialProspectId={searchParams.get('prospectId')}
          onOpenMessage={openMessage}
        />
      ) : null}

      {actionError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">
            {actionError.phase === 'analysis' ? 'Analýzu se nepodařilo dokončit' : 'Akce se nepodařila'}
          </p>
          <p>Kód: {actionError.code}{actionError.phase ? ` · fáze: ${actionError.phase}` : ''} · HTTP {actionError.httpStatus}</p>
          <p>{actionError.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {actionError.phase === 'analysis' ? (
              <button type="button" className="rounded border bg-white px-2 py-1 text-xs" onClick={() => setTab('test')}>
                Otevřít diagnostiku
              </button>
            ) : null}
            {actionError.phase === 'generate_offer' && actionError.code === 'ANALYSIS_NOT_COMPLETED' ? (
              <span className="text-xs text-red-800">Nejdříve dokončete analýzu partnera.</span>
            ) : null}
            {/OPENAI/i.test(actionError.code ?? '') ? (
              <span className="text-xs text-red-800">Můžete zkusit znovu nebo pokračovat ručním editorem v CRM.</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'message' && selectedMessageId ? (
        <AiSalesMessageEditorPanel
          token={token}
          messageId={selectedMessageId}
          onClose={() => {
            setSelectedMessageId(null);
            setTab('crm');
            router.replace('/admin/marketing/ai-sales?tab=crm');
          }}
          onUpdated={() => void refresh()}
        />
      ) : null}

      {tab === 'prospects' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2">
            <h3 className="font-semibold">Přidat kontakt ručně</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <select value={newProspect.partnerType} onChange={(e) => setNewProspect({ ...newProspect, partnerType: e.target.value })} className="rounded border px-2 py-1 text-sm">
                {PARTNER_TYPES.map((t) => <option key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</option>)}
              </select>
              <input placeholder="Název firmy *" value={newProspect.companyName} onChange={(e) => setNewProspect({ ...newProspect, companyName: e.target.value })} className="rounded border px-2 py-1 text-sm" />
              <input placeholder="Kontaktní osoba" value={newProspect.contactName} onChange={(e) => setNewProspect({ ...newProspect, contactName: e.target.value })} className="rounded border px-2 py-1 text-sm" />
              <input placeholder="E-mail" value={newProspect.email} onChange={(e) => setNewProspect({ ...newProspect, email: e.target.value })} className="rounded border px-2 py-1 text-sm" />
              <input placeholder="Město" value={newProspect.city} onChange={(e) => setNewProspect({ ...newProspect, city: e.target.value })} className="rounded border px-2 py-1 text-sm" />
              <input placeholder="Web" value={newProspect.website} onChange={(e) => setNewProspect({ ...newProspect, website: e.target.value })} className="rounded border px-2 py-1 text-sm" />
            </div>
            <textarea placeholder="Veřejné informace o firmě" value={newProspect.publicInfo} onChange={(e) => setNewProspect({ ...newProspect, publicInfo: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" rows={3} />
            <button type="button" disabled={busy || !newProspect.companyName} onClick={() => void handleCreateProspect()} className="rounded bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50">Uložit kontakt</button>
          </div>

          {prospects.length === 0 ? (
            <EmptyState title="Zatím nejsou žádní potenciální partneři." action="Přidejte první kontakt ručně nebo importujte CSV." />
          ) : (
            <ul className="space-y-2">
              {prospects.map((p) => {
                const { emails, phones, primary } = prospectContactSummary(p);
                return (
                <li key={p.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{p.companyName} <span className="text-xs text-zinc-500">{PARTNER_TYPE_LABELS[p.partnerType] ?? p.partnerType} · {p.status}</span></p>
                      <p className="text-zinc-600">{p.city ?? '—'} · Skóre: {p.fitScore ?? '—'}/100</p>
                      <p className="text-zinc-600">
                        E-maily: {emails.length || (primary ? 1 : 0)} · Telefony: {phones.length}
                        {primary ? ` · Primární: ${primary}` : ' · bez e-mailu'}
                      </p>
                      {p.fitReasonsJson && Array.isArray(p.fitReasonsJson) ? (
                        <p className="mt-1 text-xs text-zinc-500">{(p.fitReasonsJson as string[]).slice(0, 2).join(' · ')}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                  <button type="button" disabled={busy} onClick={() => void handleAnalyze(p.id)} className="rounded border px-2 py-0.5 text-xs">Analyzovat</button>
                  {p.status === 'NEEDS_REVIEW' ? (
                    <button type="button" disabled={busy} onClick={() => void approveProspect(token, p.id).then(() => refresh())} className="rounded border px-2 py-0.5 text-xs">Schválit</button>
                  ) : null}
                  <button type="button" disabled={busy || p.doNotContact} onClick={() => void handleGenerate(p.id)} className="rounded border px-2 py-0.5 text-xs bg-orange-50 border-orange-200">Vytvořit nabídku</button>
                      <button type="button" disabled={busy} onClick={() => void markDoNotContact(token, p.id)} className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700">DO_NOT_CONTACT</button>
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'search' ? (
        <AiSalesSearchPanel
          token={token}
          onSaved={() => void refresh()}
          onOpenSettings={() => setTab('settings')}
        />
      ) : null}

      {tab === 'approval' ? (
        <div className="space-y-4">
          {messages.length === 0 ? (
            <EmptyState title="Žádné nabídky ke schválení." action="Nejprve analyzujte kontakt a vygenerujte nabídku." />
          ) : (
            messages.map((m) => (
              <ApprovalCard
                key={m.id}
                message={m}
                busy={busy}
                onSelect={() => { setSelectedMsg(m); setEditSubject(m.subject ?? ''); setEditContent(m.content); }}
                onApproveSend={() => void handleApproveSend(m.id)}
                onReject={() => void rejectMessage(token, m.id).then(() => refresh())}
                onDnc={() => m.prospect && void markDoNotContact(token, m.prospect.id).then(() => refresh())}
              />
            ))
          )}
          {selectedMsg ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 space-y-2">
              <h3 className="font-semibold">Upravit před odesláním</h3>
              <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" />
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" rows={8} />
              <button type="button" disabled={busy} onClick={() => void updateMessage(token, selectedMsg.id, { subject: editSubject, content: editContent }).then(() => refresh())} className="rounded border px-3 py-1 text-sm">Uložit úpravy</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'sent' ? (
        messages.length === 0 ? (
          <EmptyState title="Zatím nebyly odeslány žádné nabídky." action="" />
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li key={m.id} className="rounded-xl border bg-white p-3 text-sm">
                <p className="font-semibold">{m.prospect?.companyName ?? m.prospectId} — {m.subject}</p>
                <p className="text-xs text-zinc-500">Odesláno: {m.sentAt ? new Date(m.sentAt).toLocaleString('cs-CZ') : '—'}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'replies' ? (
        replies.length === 0 ? (
          <EmptyState title="Zatím žádné odpovědi." action="Odpovědi se zobrazí po napojení e-mailové schránky (etapa 2)." />
        ) : (
          <ul className="space-y-2">
            {replies.map((r) => (
              <li key={String(r.id)} className="rounded-xl border bg-white p-3 text-sm">
                <p className="font-semibold">{String((r as { classification?: string }).classification ?? '—')}</p>
                <p className="text-xs text-zinc-600">{String((r as { summary?: string }).summary ?? '')}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'followup' ? <AiSalesFollowUpPanel token={token} /> : null}

      {tab === 'campaigns' ? (
        <EmptyState title="Kampaně" action="Vytvořte kampaň přes API nebo v další verzi UI. Backend endpointy jsou připravené." />
      ) : null}

      {tab === 'prompts' ? <AiSalesPromptsPanel token={token} /> : null}

      {tab === 'knowledge' ? <AiSalesKnowledgePanel token={token} /> : null}

      {tab === 'settings' && settings ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-4 space-y-3 text-sm max-w-lg">
            <h3 className="font-semibold">Obecné</h3>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(settings.testModeEnabled)} onChange={(e) => void updateSettings(token, { testModeEnabled: e.target.checked }).then(() => refresh())} /> Testovací režim (neodesílá skutečné e-maily)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(settings.requireManualApproval)} onChange={(e) => void updateSettings(token, { requireManualApproval: e.target.checked }).then(() => refresh())} /> Vyžadovat ruční schválení</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(settings.autoAnalyzeOnSave ?? true)} onChange={(e) => void updateSettings(token, { autoAnalyzeOnSave: e.target.checked }).then(() => refresh())} /> Automatická AI analýza po uložení partnera</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(settings.autoEnrichContactsOnSearch ?? true)} onChange={(e) => void updateSettings(token, { autoEnrichContactsOnSearch: e.target.checked }).then(() => refresh())} /> Automaticky dohledat veřejné kontakty po nalezení firmy</label>
            <label>Denní limit enrichmentů: <input type="number" defaultValue={Number(settings.dailyEnrichmentLimit ?? 100)} onBlur={(e) => void updateSettings(token, { dailyEnrichmentLimit: Number(e.target.value) })} className="ml-2 w-20 rounded border px-1" /></label>
            <label>Max. firem na enrichment job: <input type="number" defaultValue={Number(settings.enrichmentBatchLimit ?? 20)} onBlur={(e) => void updateSettings(token, { enrichmentBatchLimit: Number(e.target.value) })} className="ml-2 w-20 rounded border px-1" /></label>
            <label>Denní limit vyhledávání: <input type="number" defaultValue={Number(settings.dailySearchResultLimit ?? 100)} onBlur={(e) => void updateSettings(token, { dailySearchResultLimit: Number(e.target.value) })} className="ml-2 w-20 rounded border px-1" /></label>
            <label>Denní limit AI analýz: <input type="number" defaultValue={Number(settings.dailyAnalysisLimit ?? 50)} onBlur={(e) => void updateSettings(token, { dailyAnalysisLimit: Number(e.target.value) })} className="ml-2 w-20 rounded border px-1" /></label>
            <label>Denní limit prvních oslovení: <input type="number" defaultValue={Number(settings.dailyFirstOutreachLimit)} onBlur={(e) => void updateSettings(token, { dailyFirstOutreachLimit: Number(e.target.value) })} className="ml-2 w-20 rounded border px-1" /></label>
          </div>
          <div className="rounded-2xl border bg-white p-4 space-y-3 text-sm max-w-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Webové vyhledávání</h3>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                disabled={providersLoading || busy}
                onClick={() => void loadSearchProviders()}
              >
                {providersLoading ? 'Načítám…' : 'Obnovit'}
              </button>
            </div>
            {providerTestMessage ? (
              <p className={`rounded p-2 text-sm ${providerTestMessage.includes('správně') ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>
                {providerTestMessage}
              </p>
            ) : null}
            {providersLoading ? (
              <p className="text-zinc-500">Načítám providery…</p>
            ) : (
              <>
            {(['SERPAPI', 'BING'] as const).map((id) => {
              const p = searchProviders.find((x) => x.id === id);
              const label = id === 'SERPAPI' ? 'SerpAPI' : 'Bing';
              const envVar = id === 'SERPAPI' ? 'SERPAPI_API_KEY' : 'BING_SEARCH_API_KEY';
              const ready = p?.configured && p?.available;
              return (
                <div key={id} className="rounded border border-zinc-100 p-3 space-y-1">
                  <p className="font-medium">{label}</p>
                  <p>API klíč nastaven: <strong>{p?.configured ? 'Ano' : 'Ne'}</strong></p>
                  <p>Aktivní: <strong>{p?.enabled && p?.available ? 'Ano' : 'Ne'}</strong></p>
                  <p>Stav: <strong>{ready ? 'Připraveno' : p?.status === 'DISABLED' ? 'Vypnuto' : 'Nenakonfigurováno'}</strong></p>
                  {!p?.configured ? <p className="text-xs text-zinc-500">Chybí proměnná: {p?.missingVariable ?? envVar}</p> : null}
                  <button
                    type="button"
                    className="mt-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={busy || !p?.configured}
                    onClick={() => void handleTestProvider(id)}
                  >
                    Otestovat
                  </button>
                </div>
              );
            })}
            <div className="rounded border border-zinc-100 p-3 space-y-1">
              <p className="font-medium">Interní databáze</p>
              <p>Aktivní: <strong>{searchProviders.find((x) => x.id === 'INTERNAL_DATABASE')?.enabled ? 'Ano' : 'Ne'}</strong></p>
            </div>
            {activeWeb ? (
              <p className="text-sm text-green-800 bg-green-50 rounded p-2">Aktivní webový provider: <strong>{activeWeb.name}</strong> (env: {activeWeb.envVar})</p>
            ) : (
              <p className="text-sm text-amber-800 bg-amber-50 rounded p-2">Webový provider není nastaven. Použijte interní databázi nebo nastavte API klíč na backendu.</p>
            )}
            {deployment ? (
              <div className="rounded border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-600 space-y-0.5">
                <p>Backend API: <code>{API_BASE_URL || '(same-origin)'}</code></p>
                <p>Služba: {deployment.serviceName ?? '—'} · prostředí: {deployment.environment ?? '—'}</p>
                <p>Deployment: {deployment.deploymentId ?? '—'} · verze: {deployment.applicationVersion ?? '—'}</p>
                <p>SerpAPI v procesu: {deployment.serpApiConfigured ? `Ano (délka klíče ${deployment.serpApiKeyLength ?? 0})` : 'Ne'}</p>
                {deployment.serpApiKeyMasked ? <p>Klíč: {deployment.serpApiKeyMasked}</p> : null}
              </div>
            ) : null}
              </>
            )}
          </div>
          <div className="rounded-2xl border bg-white p-4 space-y-2 text-sm max-w-2xl">
            <h3 className="font-semibold">Registry providerů (databáze)</h3>
            {providersLoading ? (
              <p className="text-zinc-500">Načítám providery…</p>
            ) : providers.length === 0 ? (
              <p className="text-zinc-500">Žádné záznamy v databázi — synchronizace proběhne při dalším načtení.</p>
            ) : (
              <ul className="space-y-1">
                {providers.map((p) => (
                  <li key={String(p.id)} className="flex justify-between gap-2 border-b border-zinc-100 py-1">
                    <span>{String(p.name)}</span>
                    <span className="text-xs text-zinc-500">{p.configured ? 'nakonfigurován' : 'nenakonfigurován'} · {p.enabled ? 'zapnuto' : 'vypnuto'}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-zinc-500">Webový provider: nastavte BING_SEARCH_API_KEY nebo SERPAPI_API_KEY na backendu.</p>
          </div>
        </div>
      ) : tab === 'settings' ? (
        <p className="text-sm text-zinc-500">Načítám nastavení…</p>
      ) : null}

      {tab === 'stats' ? <AiSalesStatsPanel token={token} periodDays={periodDays} /> : null}

      {tab === 'test' ? <AiSalesTestPanel token={token} /> : null}

      {tab === 'prospects' && (
        <div className="mt-6 rounded-2xl border bg-white p-4">
          <h3 className="mb-2 font-semibold">Import CSV</h3>
          <p className="mb-2 text-xs text-zinc-500">Sloupce: firma, jmeno, email, telefon, web, typ, mesto, kraj, poznamka, zdroj</p>
          <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} className="mb-2 w-full rounded border p-2 font-mono text-xs" rows={5} placeholder="firma;email;mesto;typ&#10;ABC Reality;info@abc.cz;Pardubice;REAL_ESTATE_AGENCY" />
          <div className="flex gap-2">
            <button type="button" disabled={!csvText.trim()} onClick={() => void importPreview(token, csvText).then(setImportPreviewData)} className="rounded border px-3 py-1 text-sm">Náhled</button>
            {importPreviewData && Array.isArray((importPreviewData as { valid?: unknown[] }).valid) ? (
              <button
                type="button"
                onClick={() => void importProspects(token, (importPreviewData as { valid: Array<Record<string, unknown>> }).valid).then(() => refresh())}
                className="rounded bg-orange-600 px-3 py-1 text-sm text-white"
              >
                Importovat validní ({(importPreviewData as { valid: unknown[] }).valid.length})
              </button>
            ) : null}
          </div>
          {importPreviewData ? <pre className="mt-2 max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-xs">{JSON.stringify(importPreviewData, null, 2)}</pre> : null}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-sm text-zinc-600">{label}</p>
    </div>
  );
}

function EmptyState({ title, action }: { title: string; action: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
      <p className="text-sm text-zinc-600">{title}</p>
      {action ? <p className="mt-2 text-xs text-zinc-500">{action}</p> : null}
    </div>
  );
}

function ApprovalCard({
  message,
  busy,
  onSelect,
  onApproveSend,
  onReject,
  onDnc,
}: {
  message: AiSalesMessage;
  busy: boolean;
  onSelect: () => void;
  onApproveSend: () => void;
  onReject: () => void;
  onDnc: () => void;
}) {
  const p = message.prospect;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{p?.companyName ?? '—'}</p>
          <p className="text-zinc-500">Typ: {p ? PARTNER_TYPE_LABELS[p.partnerType] ?? p.partnerType : '—'}</p>
          <p>Skóre: <span className="font-bold text-orange-600">{p?.fitScore ?? '—'}</span> / 100</p>
          <p className="mt-1 text-zinc-600">Důvod: {message.outreachReason ?? '—'}</p>
          <p className="text-zinc-600">Produkt: {message.recommendedOffer ?? '—'}</p>
          <p className="text-xs text-zinc-400">Zdroj: {p?.source ?? '—'}</p>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{message.status}</span>
      </div>
      <p className="font-medium">Předmět: {message.subject}</p>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs">{message.content}</pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onSelect} className="rounded border px-3 py-1 text-xs">Upravit</button>
        <button type="button" disabled={busy} onClick={onApproveSend} className="rounded bg-orange-600 px-3 py-1 text-xs text-white disabled:opacity-50">Schválit a odeslat</button>
        <button type="button" disabled={busy} onClick={onReject} className="rounded border px-3 py-1 text-xs">Zamítnout</button>
        <button type="button" disabled={busy} onClick={onDnc} className="rounded border border-red-200 px-3 py-1 text-xs text-red-700">Přidat zákaz kontaktování</button>
      </div>
    </div>
  );
}
