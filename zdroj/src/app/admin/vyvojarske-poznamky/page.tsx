'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCreateDeveloperNote,
  nestAdminDeleteDeveloperNote,
  nestAdminListDeveloperNotes,
  nestAdminUpdateDeveloperNote,
  type DeveloperNoteRow,
} from '@/lib/nest-client';

const CATEGORIES = [
  { value: 'BUG', label: 'Bug' },
  { value: 'TEST', label: 'Test' },
  { value: 'IDEA', label: 'Nápad' },
  { value: 'DEPLOYMENT', label: 'Nasazení' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'CREDITS', label: 'Kredity' },
  { value: 'LISTINGS', label: 'Inzeráty' },
  { value: 'PWA', label: 'PWA' },
] as const;

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('cs-CZ');
  } catch {
    return iso;
  }
}

type EditDraft = {
  body: string;
  category: string;
  status: 'OPEN' | 'RESOLVED';
};

export default function AdminDeveloperNotesPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;

  const [items, setItems] = useState<DeveloperNoteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState<string>('TEST');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminListDeveloperNotes(token, {
      q: q || undefined,
      category: category || undefined,
      status: status || undefined,
    });
    setItems(data.items);
    setTotal(data.total);
  }, [token, q, category, status]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filteredCount = useMemo(() => items.length, [items]);

  function startEdit(note: DeveloperNoteRow) {
    setEditingId(note.id);
    setEditDraft({
      body: note.body,
      category: note.category,
      status: note.status,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const body = newBody.trim();
    if (body.length < 1) {
      setError('Vyplňte text poznámky.');
      return;
    }
    setError(null);
    setBusyId('new');
    const r = await nestAdminCreateDeveloperNote(token, {
      body,
      category: newCategory,
      status: 'OPEN',
    });
    setBusyId(null);
    if (!r.ok) {
      setError(r.error ?? 'Uložení selhalo');
      return;
    }
    setNewBody('');
    setToast('Poznámka vytvořena');
    await refresh();
  }

  async function onToggleStatus(note: DeveloperNoteRow) {
    if (!token) return;
    setBusyId(note.id);
    const next = note.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED';
    const r = await nestAdminUpdateDeveloperNote(token, note.id, { status: next });
    setBusyId(null);
    if (!r.ok) {
      setError(r.error ?? 'Změna stavu selhala');
      return;
    }
    if (r.note) {
      setItems((prev) => prev.map((n) => (n.id === note.id ? r.note! : n)));
    }
    setToast('Stav poznámky aktualizován');
    await refresh();
  }

  async function onSaveEdit(noteId: string) {
    if (!token || !editDraft) return;
    const body = editDraft.body.trim();
    if (!body) {
      setError('Text poznámky nesmí být prázdný.');
      return;
    }
    setError(null);
    setBusyId(noteId);
    const r = await nestAdminUpdateDeveloperNote(token, noteId, {
      body,
      category: editDraft.category,
      status: editDraft.status,
    });
    setBusyId(null);
    if (!r.ok) {
      setError(r.error ?? 'Uložení selhalo');
      return;
    }
    if (r.note) {
      setItems((prev) => prev.map((n) => (n.id === noteId ? r.note! : n)));
    }
    cancelEdit();
    setToast('Poznámka uložena');
    await refresh();
  }

  async function onDelete(noteId: string) {
    if (!token) return;
    if (!window.confirm('Smazat tuto poznámku?')) return;
    setBusyId(noteId);
    const r = await nestAdminDeleteDeveloperNote(token, noteId);
    setBusyId(null);
    if (!r.ok) setError(r.error ?? 'Mazání selhalo');
    else {
      if (editingId === noteId) cancelEdit();
      setToast('Poznámka smazána');
      await refresh();
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <div>
        <Link href="/admin" className="text-sm text-orange-600 hover:underline">
          ← Administrace
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">Vývojářské poznámky</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Interní evidence bugů, testů a nápadů pro vývoj.
        </p>
      </div>

      <form
        onSubmit={(e) => void onCreate(e)}
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-zinc-900">Nová poznámka</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busyId === 'new'}
            className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busyId === 'new' ? 'Ukládám…' : 'Přidat poznámku'}
          </button>
        </div>
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          rows={4}
          className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          placeholder="Text poznámky…"
        />
      </form>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Hledat</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Text poznámky…"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Kategorie</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Vše</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Stav</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Vše</option>
            <option value="OPEN">Nevyřešené</option>
            <option value="RESOLVED">Vyřešené</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold"
        >
          Filtrovat
        </button>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <p className="text-sm text-zinc-500">
        Zobrazeno {filteredCount} / {total} (řazeno od nejnovějších)
      </p>

      <ul className="space-y-3">
        {items.map((note) => {
          const isEditing = editingId === note.id && editDraft !== null;
          return (
            <li
              key={note.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-700">
                      {categoryLabel(note.category)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        note.status === 'RESOLVED'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-amber-50 text-amber-900'
                      }`}
                    >
                      {note.status === 'RESOLVED' ? 'Vyřešeno' : 'Otevřeno'}
                    </span>
                    <span className="text-zinc-500">{formatDateTime(note.createdAt)}</span>
                    <span className="text-zinc-500">
                      {note.author.name?.trim() || note.author.email}
                    </span>
                    {note.updatedBy ? (
                      <span className="text-zinc-400">
                        · upravil {note.updatedBy.name?.trim() || note.updatedBy.email}{' '}
                        {formatDateTime(note.updatedAt)}
                      </span>
                    ) : null}
                  </div>
                  {isEditing ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={editDraft.category}
                          onChange={(e) =>
                            setEditDraft((d) => (d ? { ...d, category: e.target.value } : d))
                          }
                          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={editDraft.status}
                          onChange={(e) =>
                            setEditDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    status: e.target.value as 'OPEN' | 'RESOLVED',
                                  }
                                : d,
                            )
                          }
                          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                        >
                          <option value="OPEN">Otevřeno</option>
                          <option value="RESOLVED">Vyřešeno</option>
                        </select>
                      </div>
                      <textarea
                        value={editDraft.body}
                        onChange={(e) =>
                          setEditDraft((d) => (d ? { ...d, body: e.target.value } : d))
                        }
                        rows={5}
                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
                        aria-label="Text poznámky"
                      />
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{note.body}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === note.id}
                    onClick={() => void onToggleStatus(note)}
                    className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold"
                  >
                    {note.status === 'RESOLVED' ? 'Označit otevřené' : 'Označit vyřešené'}
                  </button>
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === note.id}
                        onClick={() => void onSaveEdit(note.id)}
                        className="rounded-lg bg-[#e85d00] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {busyId === note.id ? 'Ukládám…' : 'Uložit'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === note.id}
                        onClick={cancelEdit}
                        className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold"
                      >
                        Zrušit
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(note)}
                      className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold"
                    >
                      Upravit
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === note.id}
                    onClick={() => void onDelete(note.id)}
                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-800"
                  >
                    Smazat
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
