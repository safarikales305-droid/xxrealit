'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  approveMessage,
  analyzeProspect,
  approveProspect,
  createProspect,
  generateMessage,
  getDashboard,
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
  PARTNER_TYPE_LABELS,
  PARTNER_TYPES,
  rejectMessage,
  sendMessage,
  updateMessage,
  updateSettings,
  type AiSalesDashboard,
  type AiSalesMessage,
  type AiSalesProspect,
} from '@/lib/ai-sales-admin-api';
import { AiSalesSearchPanel } from '@/components/admin/ai-sales/AiSalesSearchPanel';
import { AiSalesTestPanel } from '@/components/admin/ai-sales/AiSalesTestPanel';

type Tab =
  | 'overview'
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
  | 'test';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Přehled' },
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
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [tab, setTab] = useState<Tab>('overview');
  const [periodDays, setPeriodDays] = useState(7);
  const [dashboard, setDashboard] = useState<AiSalesDashboard | null>(null);
  const [prospects, setProspects] = useState<AiSalesProspect[]>([]);
  const [messages, setMessages] = useState<AiSalesMessage[]>([]);
  const [replies, setReplies] = useState<Array<Record<string, unknown>>>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const refresh = useCallback(async () => {
    if (!token) return;
    setError(null);
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
    }
  }, [token, periodDays, tab]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      void listSearchProviders(token).then(setProviders).catch(() => setProviders([]));
    }
  }, [tab, token]);

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
    try {
      await analyzeProspect(token, id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analýza selhala.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate(id: string) {
    if (!token) return;
    setBusy(true);
    try {
      await generateMessage(token, id);
      setTab('approval');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generování selhalo.');
    } finally {
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
            <Stat label="Čeká na kontrolu" value={dashboard.needsReview} />
            <Stat label="Ke schválení" value={dashboard.pendingApproval} />
            <Stat label="Odesláno dnes" value={dashboard.sentToday} />
            <Stat label="Odpovědi dnes" value={dashboard.repliesToday} />
            <Stat label="Pozitivní odpovědi" value={dashboard.positiveReplies} />
            <Stat label="Odmítnutí" value={dashboard.rejections} />
            <Stat label="Bez odpovědi" value={dashboard.noResponse} />
            <Stat label="Follow-upy" value={dashboard.scheduledFollowUps} />
            <Stat label="Konverze" value={dashboard.conversions} />
            <Stat label="Leady" value={dashboard.leads} />
            <Stat label="Konverzní poměr %" value={dashboard.conversionRate} />
            <Stat label="Náklady AI (Kč)" value={dashboard.aiCostCzk} />
            <Stat label="Kč / lead" value={dashboard.costPerLead} />
          </div>
        </div>
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
              {prospects.map((p) => (
                <li key={p.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{p.companyName} <span className="text-xs text-zinc-500">{PARTNER_TYPE_LABELS[p.partnerType] ?? p.partnerType} · {p.status}</span></p>
                      <p className="text-zinc-600">{p.city ?? '—'} · Skóre: {p.fitScore ?? '—'}/100 · {p.email ?? 'bez e-mailu'}</p>
                      {p.fitReasonsJson && Array.isArray(p.fitReasonsJson) ? (
                        <p className="mt-1 text-xs text-zinc-500">{(p.fitReasonsJson as string[]).slice(0, 2).join(' · ')}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                  <button type="button" disabled={busy} onClick={() => void handleAnalyze(p.id)} className="rounded border px-2 py-0.5 text-xs">Analyzovat</button>
                  {p.status === 'NEEDS_REVIEW' ? (
                    <button type="button" disabled={busy} onClick={() => void approveProspect(token, p.id).then(() => refresh())} className="rounded border px-2 py-0.5 text-xs">Schválit</button>
                  ) : null}
                  <button type="button" disabled={busy || p.doNotContact} onClick={() => void handleGenerate(p.id)} className="rounded border px-2 py-0.5 text-xs">Vytvořit nabídku</button>
                      <button type="button" disabled={busy} onClick={() => void markDoNotContact(token, p.id)} className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700">DO_NOT_CONTACT</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'search' ? <AiSalesSearchPanel token={token} onSaved={() => void refresh()} /> : null}

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

      {tab === 'followup' ? (
        <EmptyState title="Follow-up fronta" action="Follow-upy se zobrazí po odeslání prvních nabídek. Ve výchozím režimu vyžadují schválení." />
      ) : null}

      {tab === 'campaigns' ? (
        <EmptyState title="Kampaně" action="Vytvořte kampaň přes API nebo v další verzi UI. Backend endpointy jsou připravené." />
      ) : null}

      {tab === 'prompts' ? (
        prompts.length === 0 ? (
          <EmptyState title="Žádné prompty AI obchodníka." action="Spusťte seed backendu nebo vytvořte prompty v AI centru." />
        ) : (
          <ul className="space-y-2">
            {prompts.map((p) => (
              <li key={String(p.id)} className="rounded-xl border bg-white p-3 text-sm">
                <p className="font-semibold">{String(p.name ?? p.feature)} <span className="text-xs text-zinc-500">v{String(p.version)} · {String(p.status)}</span></p>
                <p className="text-xs text-zinc-500">{String(p.feature)}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'knowledge' ? (
        knowledge.length === 0 ? (
          <EmptyState title="Žádné znalosti AI obchodníka." action="Schválené znalosti se načtou ze seedu." />
        ) : (
          <ul className="space-y-2">
            {knowledge.map((k) => (
              <li key={String(k.id)} className="rounded-xl border bg-white p-3 text-sm">
                <p className="font-semibold">{String(k.title)} <span className="text-xs text-zinc-500">{String(k.status)} · {String(k.category)}</span></p>
                <p className="text-zinc-600">{String(k.question)}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'settings' && settings ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-4 space-y-3 text-sm max-w-lg">
            <h3 className="font-semibold">Obecné</h3>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(settings.testModeEnabled)} onChange={(e) => void updateSettings(token, { testModeEnabled: e.target.checked }).then(() => refresh())} /> Testovací režim (neodesílá skutečné e-maily)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(settings.requireManualApproval)} onChange={(e) => void updateSettings(token, { requireManualApproval: e.target.checked }).then(() => refresh())} /> Vyžadovat ruční schválení</label>
            <label>Denní limit vyhledávání: <input type="number" defaultValue={Number(settings.dailySearchResultLimit ?? 100)} onBlur={(e) => void updateSettings(token, { dailySearchResultLimit: Number(e.target.value) })} className="ml-2 w-20 rounded border px-1" /></label>
            <label>Denní limit AI analýz: <input type="number" defaultValue={Number(settings.dailyAnalysisLimit ?? 50)} onBlur={(e) => void updateSettings(token, { dailyAnalysisLimit: Number(e.target.value) })} className="ml-2 w-20 rounded border px-1" /></label>
            <label>Denní limit prvních oslovení: <input type="number" defaultValue={Number(settings.dailyFirstOutreachLimit)} onBlur={(e) => void updateSettings(token, { dailyFirstOutreachLimit: Number(e.target.value) })} className="ml-2 w-20 rounded border px-1" /></label>
          </div>
          <div className="rounded-2xl border bg-white p-4 space-y-2 text-sm">
            <h3 className="font-semibold">Zdroje vyhledávání</h3>
            {providers.length === 0 ? (
              <p className="text-zinc-500">Načítám providery…</p>
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
      ) : null}

      {tab === 'stats' ? (
        <EmptyState title="Statistiky" action="Přehled metrik je na záložce Přehled. Detailní analytika přes /analytics endpoint." />
      ) : null}

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
