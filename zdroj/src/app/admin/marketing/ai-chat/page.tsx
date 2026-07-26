'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';
import {
  getAiChatDiagnostics,
  runAiChatAdminTest,
  testAiChatConnection,
  type AiChatApiError,
  type AiChatDiagnostics,
  type AiChatTestState,
  type AiChatTestSuccess,
} from '@/lib/ai-chat-admin-api';
import { AiChatKnowledgePanel } from '@/components/admin/ai-chat/AiChatKnowledgePanel';
import { AiChatPromptsPanel } from '@/components/admin/ai-chat/AiChatPromptsPanel';

type Dashboard = {
  chatsToday: number;
  chatsThisWeek: number;
  activeChats: number;
  leadsThisWeek: number;
  positiveFeedback: number;
  negativeFeedback: number;
  estimatedCostCzkWeek: number;
  avgMessagesPerChat: number;
};

type SessionRow = {
  id: string;
  publicSessionId: string;
  status: string;
  detectedIntent: string | null;
  intentConfidence: number | null;
  leadScore: number;
  lastMessageAt: string;
  sourceUrl: string | null;
  user: { name: string; email: string; role: string } | null;
  _count: { messages: number; leads: number; feedback: number };
};

async function adminChatFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/admin/ai-chat${path}`, {
    ...init,
    headers: { ...nestAuthHeaders(token), 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) throw new Error(`Chyba ${res.status}`);
  return (await res.json()) as T;
}

export default function AdminAiChatPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [tab, setTab] = useState<'overview' | 'sessions' | 'knowledge' | 'prompts' | 'test'>('overview');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [knowledge, setKnowledge] = useState<Array<Record<string, unknown>>>([]);
  const [prompts, setPrompts] = useState<Array<Record<string, unknown>>>([]);
  const [testMsg, setTestMsg] = useState('Hledám byt v Pardubicích.');
  const [testState, setTestState] = useState<AiChatTestState>('IDLE');
  const [testSuccess, setTestSuccess] = useState<AiChatTestSuccess | null>(null);
  const [testError, setTestError] = useState<AiChatApiError | null>(null);
  const [diagnostics, setDiagnostics] = useState<AiChatDiagnostics | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [connectionResult, setConnectionResult] = useState<string | null>(null);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [promptsError, setPromptsError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setKnowledgeError(null);
    setPromptsError(null);
    const results = await Promise.allSettled([
      adminChatFetch<Dashboard>(token, '/dashboard'),
      adminChatFetch<SessionRow[]>(token, '/sessions?limit=50'),
      adminChatFetch<Array<Record<string, unknown>>>(token, '/knowledge'),
      adminChatFetch<Array<Record<string, unknown>>>(token, '/prompts'),
    ]);
    if (results[0].status === 'fulfilled') setDashboard(results[0].value);
    if (results[1].status === 'fulfilled') setSessions(results[1].value);
    if (results[2].status === 'fulfilled') setKnowledge(results[2].value);
    else setKnowledgeError('Znalosti se nepodařilo načíst.');
    if (results[3].status === 'fulfilled') setPrompts(results[3].value);
    else setPromptsError('Prompty se nepodařilo načíst.');
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadDiagnostics = useCallback(async () => {
    if (!token) return;
    setDiagBusy(true);
    try {
      const d = await getAiChatDiagnostics(token);
      setDiagnostics(d);
    } catch {
      setDiagnostics(null);
    } finally {
      setDiagBusy(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === 'test' && token) {
      void loadDiagnostics();
    }
  }, [tab, token, loadDiagnostics]);

  async function runConnectionTest() {
    if (!token) return;
    setConnectionBusy(true);
    setConnectionResult(null);
    try {
      const res = await testAiChatConnection(token);
      if ('success' in res && res.success) {
        setConnectionResult(`OK — model ${'model' in res ? String(res.model) : 'neznámý'}, odpověď: ${'response' in res ? String(res.response) : 'OK'}`);
      } else {
        const err = res as { code?: string; message?: string };
        setConnectionResult(`Chyba: ${err.code ?? 'UNKNOWN'} — ${err.message ?? 'Test selhal'}`);
      }
    } catch (e) {
      const err = e as AiChatApiError;
      setConnectionResult(`Chyba: ${err.code} (HTTP ${err.httpStatus}) — ${err.message}`);
    } finally {
      setConnectionBusy(false);
    }
  }

  async function runTest() {
    if (!token || busy) return;
    setBusy(true);
    setTestState('LOADING');
    setTestSuccess(null);
    setTestError(null);
    try {
      const res = await runAiChatAdminTest(token, testMsg);
      setTestSuccess(res);
      setTestState('SUCCESS');
      void loadDiagnostics();
    } catch (e) {
      const err = e as AiChatApiError;
      setTestError(err);
      setTestState('ERROR');
    } finally {
      setBusy(false);
    }
  }

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        <Link href="/admin/marketing/ai-centrum" className="text-orange-600 underline">← AI centrum</Link>
        {' · '}Správa veřejného AI chatu, konverzací, znalostí a promptů.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['overview', 'sessions', 'knowledge', 'prompts', 'test'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-orange-600 text-white' : 'border border-zinc-200'}`}
          >
            {t === 'overview' ? 'Přehled' : t === 'sessions' ? 'Konverzace' : t === 'knowledge' ? 'Znalosti' : t === 'prompts' ? 'Prompty' : 'Test'}
          </button>
        ))}
      </div>

      {tab === 'overview' && dashboard ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Chaty dnes" value={dashboard.chatsToday} />
          <Stat label="Chaty tento týden" value={dashboard.chatsThisWeek} />
          <Stat label="Aktivní chaty" value={dashboard.activeChats} />
          <Stat label="Leady týden" value={dashboard.leadsThisWeek} />
          <Stat label="👍 hodnocení" value={dashboard.positiveFeedback} />
          <Stat label="👎 hodnocení" value={dashboard.negativeFeedback} />
          <Stat label="Náklady (Kč/týden)" value={dashboard.estimatedCostCzkWeek} />
          <Stat label="Prům. zpráv/chat" value={dashboard.avgMessagesPerChat} />
        </div>
      ) : null}

      {tab === 'sessions' ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b bg-zinc-50">
              <tr>
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Intent</th>
                <th className="px-3 py-2">Lead score</th>
                <th className="px-3 py-2">Zpráv</th>
                <th className="px-3 py-2">Leady</th>
                <th className="px-3 py-2">URL</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100">
                  <td className="px-3 py-2">{new Date(s.lastMessageAt).toLocaleString('cs-CZ')}</td>
                  <td className="px-3 py-2">{s.detectedIntent ?? '—'}</td>
                  <td className="px-3 py-2">{s.leadScore}</td>
                  <td className="px-3 py-2">{s._count.messages}</td>
                  <td className="px-3 py-2">{s._count.leads}</td>
                  <td className="max-w-[200px] truncate px-3 py-2">{s.sourceUrl ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'knowledge' ? <AiChatKnowledgePanel token={token} /> : null}

      {tab === 'prompts' ? <AiChatPromptsPanel token={token} /> : null}

      {tab === 'test' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Stav AI testu</h2>
              <button
                type="button"
                disabled={diagBusy}
                onClick={() => void loadDiagnostics()}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                Obnovit diagnostiku
              </button>
            </div>
            {diagnostics ? (
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <DiagRow label="Backend" value={diagnostics.backend.available ? 'dostupný' : 'nedostupný'} />
                <DiagRow label="Databáze" value={diagnostics.database.available ? 'dostupná' : 'nedostupná'} />
                <DiagRow label="OpenAI globálně povoleno" value={diagnostics.openAi.globallyEnabled ? 'ano' : 'ne'} />
                <DiagRow label="AI chat povolen" value={diagnostics.openAi.chatEnabled ? 'ano' : 'ne'} />
                <DiagRow label="Veřejný chat" value={diagnostics.openAi.publicChatEnabled ? 'ano' : 'ne'} />
                <DiagRow label="Testovací režim" value={diagnostics.openAi.testModeEnabled ? 'ano' : 'ne'} />
                <DiagRow label="AI podpora" value={diagnostics.openAi.supportEnabled ? 'ano' : 'ne'} />
                <DiagRow label="API klíč nastaven" value={diagnostics.openAi.apiKeyConfigured ? 'ano' : 'ne'} />
                <DiagRow label="Model" value={diagnostics.openAi.model ?? '—'} />
                <DiagRow label="Poslední úspěšný test" value={diagnostics.lastSuccessfulTest ? new Date(diagnostics.lastSuccessfulTest).toLocaleString('cs-CZ') : '—'} />
                <DiagRow label="Poslední chyba" value={diagnostics.lastErrorCode ? `${diagnostics.lastErrorCode}: ${diagnostics.lastError ?? ''}` : '—'} />
                <DiagRow label="Požadavky dnes / limit" value={`${diagnostics.usage.requestsToday} / ${diagnostics.usage.dailyLimit}`} />
                <DiagRow label="Spotřeba měsíc / limit (Kč)" value={`${diagnostics.usage.estimatedCostCzkMonth} / ${diagnostics.usage.monthlyBudgetCzk}`} />
              </dl>
            ) : (
              <p className="text-xs text-zinc-500">{diagBusy ? 'Načítám diagnostiku…' : 'Diagnostika není dostupná.'}</p>
            )}
            {diagnostics?.disabledReasons?.length ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">Vypnutá nastavení:</p>
                <ul className="mt-1 list-inside list-disc">
                  {diagnostics.disabledReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-3">
              <button
                type="button"
                disabled={connectionBusy}
                onClick={() => void runConnectionTest()}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                Otestovat pouze OpenAI
              </button>
              {connectionResult ? <p className="mt-2 text-xs text-zinc-700">{connectionResult}</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <textarea value={testMsg} onChange={(e) => setTestMsg(e.target.value)} className="mb-2 w-full rounded border p-2 text-sm" rows={3} />
            <button
              type="button"
              disabled={busy}
              onClick={() => void runTest()}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Spustit testovací chat
            </button>

            {testState === 'LOADING' ? (
              <p className="mt-3 text-sm text-zinc-600">Testuji připojení a odpověď AI…</p>
            ) : null}

            {testState === 'SUCCESS' && testSuccess ? (
              <div className="mt-3 rounded bg-green-50 p-3 text-xs">
                <p className="font-semibold text-green-800">Úspěch</p>
                <p className="mt-1 whitespace-pre-wrap">{testSuccess.reply}</p>
                <p className="mt-2 text-zinc-600">
                  Intent: {testSuccess.intent ?? '—'} · confidence: {testSuccess.confidence ?? '—'} · model: {testSuccess.model} · {testSuccess.durationMs} ms · tokeny: {testSuccess.usage.totalTokens}
                </p>
              </div>
            ) : null}

            {testState === 'ERROR' && testError ? (
              <div className="mt-3 rounded bg-red-50 p-3 text-xs">
                <p className="font-semibold text-red-800">{testError.name}</p>
                <p className="mt-1">HTTP {testError.httpStatus} · kód: {testError.code}</p>
                <p className="mt-1">{testError.message}</p>
                <button
                  type="button"
                  onClick={() => void runTest()}
                  className="mt-2 rounded border border-red-200 px-3 py-1 text-xs"
                >
                  Zkusit znovu
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
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

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-zinc-100 py-1">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-800">{value}</dd>
    </div>
  );
}
