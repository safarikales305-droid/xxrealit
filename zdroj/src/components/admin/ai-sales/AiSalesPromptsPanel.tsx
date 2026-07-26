'use client';

import { useCallback, useEffect, useState } from 'react';
import { activatePrompt, listPrompts, updatePrompt, type AiSalesApiError } from '@/lib/ai-sales-admin-api';

type Props = { token: string };

export function AiSalesPromptsPanel({ token }: Props) {
  const [prompts, setPrompts] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listPrompts(token);
      setPrompts(rows);
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError(err.message ?? 'Načtení promptů selhalo.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectPrompt(p: Record<string, unknown>) {
    setSelected(p);
    setEditText(String(p.systemPrompt ?? ''));
  }

  async function save() {
    if (!token || !selected) return;
    setBusy(true);
    try {
      await updatePrompt(token, String(selected.id), { systemPrompt: editText });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uložení promptu selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!token || !selected) return;
    setBusy(true);
    try {
      await activatePrompt(token, String(selected.id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aktivace promptu selhala.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Načítám prompty…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {error ? (
        <div className="lg:col-span-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void load()}>Zkusit znovu</button>
        </div>
      ) : null}
      <ul className="space-y-1">
        {prompts.map((p) => (
          <li key={String(p.id)}>
            <button
              type="button"
              onClick={() => selectPrompt(p)}
              className={`w-full rounded border px-3 py-2 text-left text-sm ${selected?.id === p.id ? 'border-orange-400 bg-orange-50' : 'border-zinc-200 bg-white'}`}
            >
              <p className="font-medium">{String(p.name ?? p.feature)}</p>
              <p className="text-xs text-zinc-500">v{String(p.version)} · {String(p.status)}</p>
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <div className="rounded-2xl border bg-white p-4 space-y-2">
          <p className="font-semibold">{String(selected.name)}</p>
          <p className="text-xs text-zinc-500">{String(selected.feature)}</p>
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={16} className="w-full rounded border px-2 py-1 font-mono text-xs" />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded border px-3 py-1 text-sm">Uložit</button>
            {selected.status !== 'ACTIVE' ? (
              <button type="button" disabled={busy} onClick={() => void activate()} className="rounded bg-orange-600 px-3 py-1 text-sm text-white">Aktivovat</button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
          Vyberte prompt pro úpravu.
        </div>
      )}
    </div>
  );
}
