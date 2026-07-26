'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  approveKnowledge,
  createKnowledge,
  KNOWLEDGE_CATEGORIES,
  listKnowledge,
  updateKnowledge,
  type AiSalesApiError,
} from '@/lib/ai-sales-admin-api';

type Props = { token: string };

export function AiSalesKnowledgePanel({ token }: Props) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ title: '', category: 'AGENCY_OFFER', question: '', answer: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listKnowledge(token);
      setItems(rows);
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError(err.message ?? 'Načtení znalostí selhalo.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectItem(k: Record<string, unknown>) {
    setSelected(k);
    setForm({
      title: String(k.title ?? ''),
      category: String(k.category ?? 'AGENCY_OFFER'),
      question: String(k.question ?? ''),
      answer: String(k.answer ?? ''),
    });
  }

  async function save() {
    if (!token) return;
    setBusy(true);
    try {
      if (selected) {
        await updateKnowledge(token, String(selected.id), form);
      } else {
        await createKnowledge(token, form);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uložení znalosti selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!token || !selected) return;
    setBusy(true);
    try {
      await approveKnowledge(token, String(selected.id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Schválení selhalo.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Načítám znalosti…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {error ? (
        <div className="lg:col-span-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void load()}>Zkusit znovu</button>
        </div>
      ) : null}
      <div>
        <button type="button" onClick={() => { setSelected(null); setForm({ title: '', category: 'AGENCY_OFFER', question: '', answer: '' }); }} className="mb-2 rounded border px-2 py-1 text-xs">+ Nová znalost</button>
        <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
          {items.map((k) => (
            <li key={String(k.id)}>
              <button type="button" onClick={() => selectItem(k)} className={`w-full rounded border px-3 py-2 text-left text-sm ${selected?.id === k.id ? 'border-orange-400 bg-orange-50' : 'border-zinc-200 bg-white'}`}>
                <p className="font-medium">{String(k.title)}</p>
                <p className="text-xs text-zinc-500">{String(k.status)} · {String(k.category)}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border bg-white p-4 space-y-2 text-sm">
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Název" className="w-full rounded border px-2 py-1" />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded border px-2 py-1">
          {KNOWLEDGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Otázka" className="w-full rounded border px-2 py-1" />
        <textarea value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Odpověď (schválená znalost)" rows={10} className="w-full rounded border px-2 py-1" />
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded border px-3 py-1">Uložit</button>
          {selected && selected.status !== 'APPROVED' ? (
            <button type="button" disabled={busy} onClick={() => void approve()} className="rounded bg-orange-600 px-3 py-1 text-white">Schválit</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
