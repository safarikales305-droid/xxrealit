'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addPartnerMemory,
  analyzeProspect,
  approveProspect,
  generateMessage,
  getCrmPartner,
  listCrmPartners,
  PARTNER_TYPE_LABELS,
  PROSPECT_STATUS_LABELS,
  updateCrmPartner,
  type AiSalesApiError,
} from '@/lib/ai-sales-admin-api';

type Props = { token: string };

export function AiSalesCrmPanel({ token }: Props) {
  const [partners, setPartners] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const loadPartners = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listCrmPartners(token, q || undefined);
      setPartners(rows);
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError(err.message ?? 'Načtení CRM selhalo.');
    } finally {
      setLoading(false);
    }
  }, [token, q]);

  const loadDetail = useCallback(async (id: string) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const row = await getCrmPartner(token, id);
      setDetail(row);
      setSelectedId(id);
      setNote(String(row.notes ?? ''));
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError(err.message ?? 'Načtení karty selhalo.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  async function saveNotes() {
    if (!token || !selectedId) return;
    setBusy(true);
    try {
      await updateCrmPartner(token, selectedId, { notes: note });
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uložení poznámek selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!token || !selectedId || !note.trim()) return;
    setBusy(true);
    try {
      await addPartnerMemory(token, selectedId, { memoryType: 'MANUAL', content: note.trim() });
      await loadDetail(selectedId);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Přidání paměti selhalo.');
    } finally {
      setBusy(false);
    }
  }

  const recommendation = detail?.aiRecommendationJson as Record<string, unknown> | null;
  const profile = detail?.companyProfileJson as Record<string, unknown> | null;
  const memories = (detail?.memories as Array<Record<string, unknown>>) ?? [];
  const messages = (detail?.messages as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat partnera…"
            className="flex-1 rounded border px-2 py-1 text-sm"
          />
          <button type="button" onClick={() => void loadPartners()} className="rounded border px-2 text-xs">Hledat</button>
        </div>
        {loading ? <p className="text-sm text-zinc-500">Načítám partnery…</p> : null}
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            {error}
            <button type="button" className="ml-2 underline" onClick={() => void loadPartners()}>Zkusit znovu</button>
          </div>
        ) : null}
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
          {partners.map((p) => (
            <li key={String(p.id)}>
              <button
                type="button"
                onClick={() => void loadDetail(String(p.id))}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedId === p.id ? 'border-orange-400 bg-orange-50' : 'border-zinc-200 bg-white'}`}
              >
                <p className="font-medium">{String(p.companyName)}</p>
                <p className="text-xs text-zinc-500">
                  {PARTNER_TYPE_LABELS[String(p.partnerType)] ?? String(p.partnerType)} · Skóre {String(p.fitScore ?? '—')} · {PROSPECT_STATUS_LABELS[String(p.status)] ?? String(p.status)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {!detail ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
          Vyberte partnera pro zobrazení CRM karty.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="text-lg font-semibold">{String(detail.companyName)}</h3>
            <p className="text-sm text-zinc-600">
              {PARTNER_TYPE_LABELS[String(detail.partnerType)] ?? String(detail.partnerType)} · {String(detail.city ?? '—')} · {String(detail.region ?? '—')}
            </p>
            <p className="mt-1 text-sm">Fit score: <strong>{String(detail.fitScore ?? '—')}</strong> / 100 · Priorita: {String(detail.priority ?? '—')}</p>
            <p className="text-sm">Stav: {PROSPECT_STATUS_LABELS[String(detail.status)] ?? String(detail.status)}</p>
            <p className="text-sm">Web: {String(detail.website ?? '—')} · E-mail: {String(detail.email ?? '—')} · Tel: {String(detail.phone ?? '—')}</p>
            <p className="text-xs text-zinc-500">Zdroj: {String(detail.source ?? '—')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void (async () => { await analyzeProspect(token, String(detail.id)); await loadDetail(String(detail.id)); })()} className="rounded border px-2 py-1 text-xs">Analyzovat</button>
              <button type="button" disabled={busy} onClick={() => void (async () => { await approveProspect(token, String(detail.id)); await loadDetail(String(detail.id)); })()} className="rounded border px-2 py-1 text-xs">Schválit</button>
              <button type="button" disabled={busy} onClick={() => void generateMessage(token, String(detail.id))} className="rounded bg-orange-600 px-2 py-1 text-xs text-white">Vytvořit nabídku</button>
            </div>
          </div>

          {recommendation ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm">
              <p className="font-semibold">AI doporučuje</p>
              <p className="mt-1">{String(recommendation.action ?? '—')}</p>
              <p className="text-xs text-zinc-600">Nabídka: {String(recommendation.recommendedOffer ?? '—')}</p>
            </div>
          ) : null}

          {profile ? (
            <div className="rounded-2xl border bg-white p-4 text-sm space-y-1">
              <p className="font-semibold">Firemní profil (AI)</p>
              <p>{String(profile.summary ?? detail.publicInfo ?? '—')}</p>
              <p className="text-xs text-zinc-600">Specializace: {Array.isArray(profile.specialization) ? profile.specialization.join(', ') : 'Nezjištěno'}</p>
              <p className="text-xs text-zinc-600">Služby: {Array.isArray(profile.services) ? profile.services.join(', ') : 'Nezjištěno'}</p>
            </div>
          ) : null}

          <div className="rounded-2xl border bg-white p-4 text-sm">
            <p className="font-semibold">Poznámky a AI paměť</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-2 w-full rounded border px-2 py-1 text-sm" placeholder="Poznámka administrátora…" />
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void saveNotes()} className="rounded border px-2 py-1 text-xs">Uložit poznámku</button>
              <button type="button" disabled={busy} onClick={() => void addNote()} className="rounded border px-2 py-1 text-xs">Přidat do AI paměti</button>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-zinc-600">
              {memories.map((m) => (
                <li key={String(m.id)} className="border-b border-zinc-100 py-1">
                  <span className="font-medium">{String(m.memoryType)}:</span> {String(m.content)}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border bg-white p-4 text-sm">
            <p className="font-semibold">E-maily ({messages.length})</p>
            <ul className="mt-2 space-y-2 text-xs">
              {messages.map((m) => (
                <li key={String(m.id)} className="rounded bg-zinc-50 p-2">
                  <p className="font-medium">{String(m.subject ?? '—')} · {String(m.status)}</p>
                  <p className="text-zinc-500">{m.sentAt ? new Date(String(m.sentAt)).toLocaleString('cs-CZ') : 'neodesláno'}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
