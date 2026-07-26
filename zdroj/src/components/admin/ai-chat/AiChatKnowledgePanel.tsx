'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  approveAiKnowledge,
  archiveAiKnowledge,
  createAiKnowledge,
  deleteAiKnowledge,
  duplicateAiKnowledge,
  updateAiKnowledge,
  KNOWLEDGE_CATEGORIES,
  listAiKnowledge,
  testAiKnowledge,
  type AiKnowledgeItem,
} from '@/lib/ai-chat-admin-api';

type Props = { token: string };

const EMPTY_FORM = {
  title: '',
  category: 'PORTAL_GENERAL',
  question: '',
  answer: '',
  keywords: '',
  priority: 0,
};

export function AiChatKnowledgePanel({ token }: Props) {
  const [items, setItems] = useState<AiKnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AiKnowledgeItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testMsg, setTestMsg] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set('status', filterStatus);
      const data = await listAiKnowledge(token, qs.toString());
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Znalosti se nepodařilo načíst.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(item: AiKnowledgeItem) {
    setEditing(item);
    setForm({
      title: item.title,
      category: item.category,
      question: item.question,
      answer: item.answer,
      keywords: Array.isArray(item.keywordsJson) ? item.keywordsJson.join(', ') : '',
      priority: item.priority ?? 0,
    });
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const body = {
        title: form.title,
        category: form.category,
        question: form.question,
        answer: form.answer,
        keywordsJson: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
        priority: form.priority,
      };
      if (editing) {
        await updateAiKnowledge(token, editing.id, body);
      } else {
        await createAiKnowledge(token, body);
      }
      await load();
      setEditing(null);
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uložení selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Akce selhala.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Načítám znalosti…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded border px-2 py-1 text-sm">
          <option value="">Všechny stavy</option>
          <option value="DRAFT">Koncept</option>
          <option value="APPROVED">Schválené</option>
          <option value="ARCHIVED">Archiv</option>
        </select>
        <button type="button" onClick={() => void load()} className="rounded border px-3 py-1 text-sm">Načíst znovu</button>
        <button type="button" onClick={openCreate} className="rounded bg-orange-600 px-3 py-1 text-sm text-white">Přidat znalost</button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void load()}>Načíst znovu</button>
        </div>
      ) : null}

      {(editing || form.title || form.question) ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2">
          <h3 className="font-semibold">{editing ? 'Upravit znalost' : 'Nová znalost'}</h3>
          <input placeholder="Název" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded border px-2 py-1 text-sm">
            {KNOWLEDGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Otázka" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
          <textarea placeholder="Schválená odpověď" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" rows={4} />
          <input placeholder="Klíčová slova (čárkou)" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
          <input type="number" placeholder="Priorita" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className="w-full rounded border px-2 py-1 text-sm" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void saveDraft()} className="rounded bg-zinc-800 px-3 py-1 text-sm text-white disabled:opacity-50">Uložit koncept</button>
            <button type="button" onClick={() => { setForm(EMPTY_FORM); setEditing(null); }} className="rounded border px-3 py-1 text-sm">Zrušit</button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <p className="text-sm text-zinc-600">Zatím nejsou vytvořené žádné znalosti.</p>
          <button type="button" onClick={openCreate} className="mt-3 rounded bg-orange-600 px-4 py-2 text-sm text-white">Přidat první znalost</button>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((k) => (
            <li key={k.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{k.title} <span className="text-xs text-zinc-500">({k.status}) · {k.category} · p{k.priority}</span></p>
                  <p className="text-zinc-600">{k.question}</p>
                  <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{k.answer}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => openEdit(k)} className="rounded border px-2 py-0.5 text-xs">Upravit</button>
                  {k.status === 'DRAFT' ? (
                    <button type="button" disabled={busy} onClick={() => void runAction(() => approveAiKnowledge(token, k.id))} className="rounded border px-2 py-0.5 text-xs">Schválit</button>
                  ) : null}
                  <button type="button" disabled={busy} onClick={() => void runAction(() => duplicateAiKnowledge(token, k.id))} className="rounded border px-2 py-0.5 text-xs">Duplikovat</button>
                  <button type="button" disabled={busy} onClick={() => void runAction(() => archiveAiKnowledge(token, k.id))} className="rounded border px-2 py-0.5 text-xs">Archivovat</button>
                  {k.status === 'DRAFT' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm('Opravdu smazat tuto znalost?')) return;
                        void runAction(() => deleteAiKnowledge(token, k.id));
                      }}
                      className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700"
                    >
                      Smazat
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="Testovací otázka" className="flex-1 rounded border px-2 py-1 text-xs" />
                <button
                  type="button"
                  disabled={busy || !testMsg.trim()}
                  onClick={() => void testAiKnowledge(token, k.id, testMsg).then((r) => setTestResult(JSON.stringify(r, null, 2))).catch((e) => setTestResult(e instanceof Error ? e.message : 'Test selhal'))}
                  className="rounded border px-2 py-1 text-xs"
                >
                  Otestovat v chatu
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {testResult ? <pre className="max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-xs">{testResult}</pre> : null}
    </div>
  );
}
