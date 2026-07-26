'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

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
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [d, s, k, p] = await Promise.all([
      adminChatFetch<Dashboard>(token, '/dashboard'),
      adminChatFetch<SessionRow[]>(token, '/sessions?limit=50'),
      adminChatFetch<Array<Record<string, unknown>>>(token, '/knowledge'),
      adminChatFetch<Array<Record<string, unknown>>>(token, '/prompts'),
    ]);
    setDashboard(d);
    setSessions(s);
    setKnowledge(k);
    setPrompts(p);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runTest() {
    if (!token) return;
    setBusy(true);
    setTestResult(null);
    try {
      const res = await adminChatFetch<{ result: { message: { content: string } } }>(token, '/test', {
        method: 'POST',
        body: JSON.stringify({ message: testMsg, sourcePageType: 'TEST' }),
      });
      setTestResult(res.result?.message?.content ?? 'OK');
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : 'Test selhal');
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

      {tab === 'knowledge' ? (
        <ul className="space-y-2">
          {knowledge.map((k) => (
            <li key={String(k.id)} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
              <p className="font-semibold">{String(k.title)} <span className="text-xs text-zinc-500">({String(k.status)})</span></p>
              <p className="text-zinc-600">{String(k.question)}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'prompts' ? (
        <ul className="space-y-2">
          {prompts.map((p) => (
            <li key={String(p.id)} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
              <p className="font-semibold">{String(p.feature)} v{String(p.version)} <span className="text-xs text-zinc-500">({String(p.status)})</span></p>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'test' ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <textarea value={testMsg} onChange={(e) => setTestMsg(e.target.value)} className="mb-2 w-full rounded border p-2 text-sm" rows={3} />
          <button type="button" disabled={busy} onClick={() => void runTest()} className="rounded-lg bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            Spustit testovací chat
          </button>
          {testResult ? <pre className="mt-3 whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs">{testResult}</pre> : null}
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
