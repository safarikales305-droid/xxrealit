'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addPartnerMemory,
  analyzeProspect,
  approveMessage,
  approveProspect,
  enrichProspect,
  generateMessage,
  generateManualMessage,
  getCrmPartner,
  getSearchResultContacts,
  importSearchContacts,
  listCrmPartners,
  PARTNER_TYPE_LABELS,
  PROSPECT_STATUS_LABELS,
  regenerateMessage,
  setProspectContactPrimary,
  toggleProspectContactOutreach,
  updateCrmPartner,
  updateProspectContact,
  type AiSalesApiError,
  type AiSalesPublicContact,
} from '@/lib/ai-sales-admin-api';

type Props = {
  token: string;
  initialProspectId?: string | null;
  onOpenMessage?: (messageId: string) => void;
};

const VARIANT_TONE: Record<string, string> = {
  A: 'PROFESSIONAL',
  B: 'FRIENDLY',
  C: 'CONCISE',
  MANUAL: 'RUČNÍ',
};

export function AiSalesCrmPanel({ token, initialProspectId, onOpenMessage }: Props) {
  const [partners, setPartners] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [contactForm, setContactForm] = useState({
    email: '',
    phone: '',
    contactName: '',
    position: '',
    website: '',
    contactSourceNote: '',
    manualConfirm: false,
  });
  const [showContactEdit, setShowContactEdit] = useState(false);
  const [publicContacts, setPublicContacts] = useState<AiSalesPublicContact[]>([]);
  const [importContacts, setImportContacts] = useState<AiSalesPublicContact[]>([]);
  const [showImportContacts, setShowImportContacts] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());

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
    setNotice(null);
    try {
      const row = await getCrmPartner(token, id);
      setDetail(row);
      setSelectedId(id);
      const fromDetail = (row.publicContacts as AiSalesPublicContact[] | undefined) ?? [];
      setPublicContacts(fromDetail);
      setNote(String(row.notes ?? ''));
      setContactForm({
        email: String(row.primaryEmail ?? row.email ?? ''),
        phone: String(row.primaryPhone ?? row.phone ?? ''),
        contactName: String(row.contactName ?? ''),
        position: String(row.position ?? ''),
        website: String(row.website ?? ''),
        contactSourceNote: String(row.contactSourceNote ?? ''),
        manualConfirm: false,
      });
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

  useEffect(() => {
    if (initialProspectId && token) {
      void loadDetail(initialProspectId);
    }
  }, [initialProspectId, token, loadDetail]);

  async function saveContact() {
    if (!token || !selectedId) return;
    setBusy(true);
    try {
      await updateProspectContact(token, selectedId, contactForm);
      await loadDetail(selectedId);
      setShowContactEdit(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uložení kontaktu selhalo.');
    } finally {
      setBusy(false);
    }
  }

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

  async function handleGenerateMessage() {
    if (!token || !detail) return;
    setBusy(true);
    setError(null);
    try {
      const res = await generateMessage(token, String(detail.id), { variantCount: 3 });
      const firstId = res.messageId ?? res.variants?.[0]?.messageId;
      if (res.partial || res.analysisIncomplete) {
        setNotice('Nabídka byla vytvořena bez dokončené AI analýzy. Návrh je plně editovatelný.');
      }
      await loadDetail(String(detail.id));
      if (firstId && onOpenMessage) onOpenMessage(firstId);
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError(err.message ?? 'Generování nabídky selhalo.');
      try {
        const manual = await generateManualMessage(token, String(detail.id));
        if (manual.message?.id && onOpenMessage) {
          onOpenMessage(String(manual.message.id));
          setNotice('Otevřen ruční návrh bez OpenAI.');
        }
      } catch {
        // manual fallback failed
      }
    } finally {
      setBusy(false);
    }
  }

  async function openImportContacts() {
    if (!token || !detail?.sourceSearchResultId) return;
    setBusy(true);
    try {
      const rows = await getSearchResultContacts(token, String(detail.sourceSearchResultId));
      setImportContacts(rows);
      setSelectedImportIds(new Set(rows.map((c) => c.id)));
      setShowImportContacts(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Načtení kontaktů ze search resultu selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImportContacts() {
    if (!token || !selectedId) return;
    setBusy(true);
    try {
      const res = await importSearchContacts(token, selectedId, {
        selectedContactIds: [...selectedImportIds],
        primaryEmailContactId:
          importContacts.find((c) => c.type === 'EMAIL' && c.isPrimary)?.id ??
          importContacts.find((c) => c.type === 'EMAIL')?.id,
        primaryPhoneContactId:
          importContacts.find((c) => c.type === 'PHONE' && c.isPrimary)?.id ??
          importContacts.find((c) => c.type === 'PHONE')?.id,
      });
      setNotice(`Přeneseno kontaktů: ${res.contactsSaved} (e-maily: ${res.emailsSaved}, telefony: ${res.phonesSaved})`);
      setShowImportContacts(false);
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Přenos kontaktů selhal.');
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
          {notice ? <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">{notice}</div> : null}

          <div className="rounded-2xl border bg-white p-4">
            <h3 className="text-lg font-semibold">{String(detail.companyName)}</h3>
            <p className="text-sm text-zinc-600">
              {PARTNER_TYPE_LABELS[String(detail.partnerType)] ?? String(detail.partnerType)} · {String(detail.city ?? '—')} · {String(detail.region ?? '—')}
            </p>
            <p className="mt-1 text-sm">Fit score: <strong>{String(detail.fitScore ?? '—')}</strong> / 100 · Priorita: {String(detail.priority ?? '—')}</p>
            <p className="text-sm">Stav: {PROSPECT_STATUS_LABELS[String(detail.status)] ?? String(detail.status)}</p>
            <p className="text-sm">Web: {String(detail.website ?? '—')} · E-mail: {String(detail.primaryEmail ?? detail.email ?? '—')} · Tel: {String(detail.primaryPhone ?? detail.phone ?? '—')}</p>
            <p className="text-xs text-zinc-500">
              Ověření kontaktu: {String(detail.contactVerificationStatus ?? '—')} · Zdroj: {String(detail.source ?? '—')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !detail.website} onClick={() => void enrichProspect(token, String(detail.id)).then(() => loadDetail(String(detail.id)))} className="rounded border px-2 py-1 text-xs">Dohledat kontakty</button>
              <button type="button" disabled={busy} onClick={() => setShowContactEdit((v) => !v)} className="rounded border px-2 py-1 text-xs">Upravit kontakt</button>
              <button type="button" disabled={busy} onClick={() => void (async () => { await analyzeProspect(token, String(detail.id)); await loadDetail(String(detail.id)); })()} className="rounded border px-2 py-1 text-xs">Analyzovat</button>
              <button type="button" disabled={busy} onClick={() => void (async () => { await approveProspect(token, String(detail.id)); await loadDetail(String(detail.id)); })()} className="rounded border px-2 py-1 text-xs">Schválit</button>
              <button type="button" disabled={busy || Boolean(detail.doNotContact)} onClick={() => void handleGenerateMessage()} className="rounded bg-orange-600 px-2 py-1 text-xs text-white">Vytvořit nabídku</button>
            </div>
          </div>

          {showContactEdit ? (
            <div className="rounded-2xl border bg-white p-4 text-sm space-y-2">
              <p className="font-semibold">Upravit kontakt</p>
              <input placeholder="E-mail" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className="w-full rounded border px-2 py-1" />
              <input placeholder="Telefon" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} className="w-full rounded border px-2 py-1" />
              <input placeholder="Kontaktní osoba" value={contactForm.contactName} onChange={(e) => setContactForm({ ...contactForm, contactName: e.target.value })} className="w-full rounded border px-2 py-1" />
              <input placeholder="Pozice" value={contactForm.position} onChange={(e) => setContactForm({ ...contactForm, position: e.target.value })} className="w-full rounded border px-2 py-1" />
              <input placeholder="Web" value={contactForm.website} onChange={(e) => setContactForm({ ...contactForm, website: e.target.value })} className="w-full rounded border px-2 py-1" />
              <textarea placeholder="Zdroj / poznámka ke kontaktu" value={contactForm.contactSourceNote} onChange={(e) => setContactForm({ ...contactForm, contactSourceNote: e.target.value })} className="w-full rounded border px-2 py-1" rows={2} />
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={contactForm.manualConfirm} onChange={(e) => setContactForm({ ...contactForm, manualConfirm: e.target.checked })} />
                Potvrzuji, že jde o oprávněně získaný veřejný nebo obchodní kontakt.
              </label>
              <button type="button" disabled={busy || !contactForm.manualConfirm} onClick={() => void saveContact()} className="rounded bg-orange-600 px-3 py-1 text-xs text-white disabled:opacity-50">
                Uložit kontakt
              </button>
            </div>
          ) : null}

          <div className="rounded-2xl border bg-white p-4 text-sm overflow-x-auto">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">Kontakty ({publicContacts.length})</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {publicContacts.length === 0 && detail.sourceSearchResultId ? (
                  <button type="button" disabled={busy} className="rounded border px-2 py-0.5" onClick={() => void openImportContacts()}>
                    Přenést kontakty z výsledku vyhledávání
                  </button>
                ) : null}
              </div>
            </div>
            {publicContacts.length === 0 ? (
              <div className="space-y-2 text-xs text-zinc-600">
                <p>Žádné veřejné kontakty.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || !detail.website} className="rounded border px-2 py-0.5" onClick={() => void enrichProspect(token, String(detail.id)).then(() => loadDetail(String(detail.id)))}>Dohledat kontakty</button>
                  {detail.sourceSearchResultId ? (
                    <button type="button" disabled={busy} className="rounded border px-2 py-0.5" onClick={() => void openImportContacts()}>Přenést z vyhledávání</button>
                  ) : null}
                  <button type="button" disabled={busy} className="rounded border px-2 py-0.5" onClick={() => setShowContactEdit(true)}>Přidat ručně</button>
                </div>
              </div>
            ) : (
              <table className="mt-2 min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-1">Oslovení</th>
                    <th className="px-2 py-1">Typ</th>
                    <th className="px-2 py-1">Kontakt</th>
                    <th className="px-2 py-1">Popisek</th>
                    <th className="px-2 py-1">Zdroj</th>
                    <th className="px-2 py-1">Ověření</th>
                    <th className="px-2 py-1">Primární</th>
                    <th className="px-2 py-1">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {publicContacts.map((c) => (
                    <tr key={c.id} className="border-b border-zinc-100">
                      <td className="px-2 py-1">{c.isSelectedForOutreach ? '✓' : '—'}</td>
                      <td className="px-2 py-1">{c.type}</td>
                      <td className="px-2 py-1">{c.value}</td>
                      <td className="px-2 py-1">{c.label ?? '—'}</td>
                      <td className="px-2 py-1">
                        {c.sourceUrl ? (
                          <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="underline">Otevřít</a>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-1">{c.verificationStatus}</td>
                      <td className="px-2 py-1">{c.isPrimary ? 'ano' : 'ne'}</td>
                      <td className="px-2 py-1">
                        <div className="flex flex-wrap gap-1">
                          <button type="button" className="underline" onClick={() => void setProspectContactPrimary(token, String(detail.id), c.id).then(() => loadDetail(String(detail.id)))}>Primární</button>
                          {c.type === 'EMAIL' ? (
                            <button type="button" className="underline" onClick={() => void toggleProspectContactOutreach(token, String(detail.id), c.id, !c.isSelectedForOutreach).then(() => loadDetail(String(detail.id)))}>
                              {c.isSelectedForOutreach ? 'Nepoužívat' : 'Pro oslovení'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {showImportContacts ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm">
              <p className="font-semibold">Přenést nalezené kontakty</p>
              <ul className="mt-2 space-y-1">
                {importContacts.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedImportIds.has(c.id)}
                        onChange={() => {
                          setSelectedImportIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          });
                        }}
                      />
                      {c.type}: {c.value} {c.label ? `· ${c.label}` : ''}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} className="rounded bg-green-600 px-3 py-1 text-xs text-white" onClick={() => void confirmImportContacts()}>
                  Přenést vybrané ({selectedImportIds.size})
                </button>
                <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => setShowImportContacts(false)}>Zrušit</button>
              </div>
            </div>
          ) : null}

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
            <p className="font-semibold">E-maily / nabídky ({messages.length})</p>
            {messages.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Zatím žádné nabídky. Vytvořte první DRAFT.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-xs">
                {messages.map((m) => {
                  const recipientCount = (m._count as { recipients?: number } | undefined)?.recipients ?? 0;
                  const variant = String(m.variantLabel ?? 'A');
                  return (
                    <li key={String(m.id)} className="rounded border border-zinc-100 bg-zinc-50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{String(m.subject ?? 'Bez předmětu')}</p>
                          <p className="text-zinc-600">
                            Stav: {String(m.status)} · Varianta {variant} · {VARIANT_TONE[variant] ?? variant}
                          </p>
                          <p className="text-zinc-500">
                            Vytvořeno: {m.createdAt ? new Date(String(m.createdAt)).toLocaleString('cs-CZ') : '—'}
                            {m.approvedAt ? ` · Schváleno: ${new Date(String(m.approvedAt)).toLocaleString('cs-CZ')}` : ''}
                          </p>
                          <p className="text-zinc-500">Příjemci: {recipientCount}</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded bg-orange-600 px-2 py-1 text-white"
                            onClick={() => onOpenMessage?.(String(m.id))}
                          >
                            Otevřít náhled
                          </button>
                          {m.status === 'DRAFT' || m.status === 'PENDING_APPROVAL' ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded border px-2 py-1"
                              onClick={() => void approveMessage(token, String(m.id)).then(() => loadDetail(String(detail.id)))}
                            >
                              Schválit
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded border px-2 py-1"
                            onClick={() => void regenerateMessage(token, String(m.id)).then(() => loadDetail(String(detail.id)))}
                          >
                            Vygenerovat znovu
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
