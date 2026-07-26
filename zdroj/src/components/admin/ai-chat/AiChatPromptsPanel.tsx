'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  activateAiPrompt,
  archiveAiPrompt,
  createAiPrompt,
  duplicateAiPrompt,
  listAiPrompts,
  PROMPT_TYPES,
  restoreAiPrompt,
  testAiPrompt,
  updateAiPrompt,
  type AiPromptItem,
} from '@/lib/ai-chat-admin-api';

type Props = { token: string };

const EMPTY_FORM = {
  name: '',
  feature: 'MAIN_CHAT',
  version: '1.0.0',
  systemPrompt: '',
  changeDescription: '',
};

export function AiChatPromptsPanel({ token }: Props) {
  const [items, setItems] = useState<AiPromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AiPromptItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testMsg, setTestMsg] = useState('Hledám byt v Pardubicích.');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [filterFeature, setFilterFeature] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAiPrompts(token, filterFeature || undefined);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prompty se nepodařilo načíst.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, filterFeature]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(item: AiPromptItem) {
    setEditing(item);
    setForm({
      name: item.name ?? item.feature,
      feature: item.feature,
      version: item.version,
      systemPrompt: item.systemPrompt,
      changeDescription: item.changeDescription ?? '',
    });
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const body = {
        name: form.name,
        feature: form.feature,
        version: form.version,
        systemPrompt: form.systemPrompt,
        changeDescription: form.changeDescription,
      };
      if (editing) {
        await updateAiPrompt(token, editing.id, body);
      } else {
        await createAiPrompt(token, body);
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

  if (loading) return <p className="text-sm text-zinc-500">Načítám prompty…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={filterFeature} onChange={(e) => setFilterFeature(e.target.value)} className="rounded border px-2 py-1 text-sm">
          <option value="">Všechny typy</option>
          {PROMPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" onClick={() => void load()} className="rounded border px-3 py-1 text-sm">Načíst znovu</button>
        <button type="button" onClick={openCreate} className="rounded bg-orange-600 px-3 py-1 text-sm text-white">Vytvořit prompt</button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => void load()}>Načíst znovu</button>
        </div>
      ) : null}

      {(editing || form.systemPrompt || form.name) ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2">
          <h3 className="font-semibold">{editing ? 'Upravit prompt' : 'Nový prompt'}</h3>
          <input placeholder="Název" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
          <select value={form.feature} onChange={(e) => setForm({ ...form, feature: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" disabled={Boolean(editing)}>
            {PROMPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input placeholder="Verze" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" disabled={Boolean(editing)} />
          <textarea placeholder="Obsah promptu (proměnné: {{portalName}}, {{availableListings}}, …)" value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} className="w-full rounded border px-2 py-1 font-mono text-xs" rows={12} />
          <input placeholder="Popis změny" value={form.changeDescription} onChange={(e) => setForm({ ...form, changeDescription: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void saveDraft()} className="rounded bg-zinc-800 px-3 py-1 text-sm text-white disabled:opacity-50">Uložit jako koncept</button>
            {editing ? (
              <>
                <button type="button" disabled={busy} onClick={() => void runAction(() => activateAiPrompt(token, editing.id))} className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50">Aktivovat</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void testAiPrompt(token, editing.id, { message: testMsg, pageType: 'PORTAL', userRole: 'ADMIN' }).then((r) => setTestResult(JSON.stringify(r, null, 2)))}
                  className="rounded border px-3 py-1 text-sm"
                >
                  Otestovat
                </button>
              </>
            ) : null}
            <button type="button" onClick={() => { setForm(EMPTY_FORM); setEditing(null); }} className="rounded border px-3 py-1 text-sm">Zrušit</button>
          </div>
          <input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} className="w-full rounded border px-2 py-1 text-xs" placeholder="Testovací zpráva" />
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <p className="text-sm text-zinc-600">Zatím nejsou vytvořené žádné prompty.</p>
          <button type="button" onClick={openCreate} className="mt-3 rounded bg-orange-600 px-4 py-2 text-sm text-white">Vytvořit první prompt</button>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{p.name ?? p.feature} <span className="text-xs text-zinc-500">v{p.version} · {p.status}</span></p>
                  <p className="text-xs text-zinc-500">{p.feature}</p>
                  <p className="mt-1 line-clamp-2 font-mono text-xs text-zinc-600">{p.systemPrompt}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => openEdit(p)} className="rounded border px-2 py-0.5 text-xs">Upravit</button>
                  {p.status !== 'ACTIVE' ? (
                    <button type="button" disabled={busy} onClick={() => void runAction(() => activateAiPrompt(token, p.id))} className="rounded border px-2 py-0.5 text-xs">Aktivovat</button>
                  ) : null}
                  <button type="button" disabled={busy} onClick={() => void runAction(() => duplicateAiPrompt(token, p.id))} className="rounded border px-2 py-0.5 text-xs">Duplikovat</button>
                  {p.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(() => restoreAiPrompt(token, p.feature))}
                      className="rounded border px-2 py-0.5 text-xs"
                    >
                      Vrátit předchozí verzi
                    </button>
                  ) : null}
                  <button type="button" disabled={busy} onClick={() => void runAction(() => archiveAiPrompt(token, p.id))} className="rounded border px-2 py-0.5 text-xs">Archivovat</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {testResult ? <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-2 text-xs">{testResult}</pre> : null}
    </div>
  );
}
