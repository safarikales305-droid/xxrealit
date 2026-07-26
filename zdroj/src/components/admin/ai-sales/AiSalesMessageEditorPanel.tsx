'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  approveMessage,
  getMessage,
  regenerateMessage,
  sendMessage,
  sendTestMessage,
  submitMessageForApproval,
  updateMessage,
  type AiSalesApiError,
  type AiSalesMessage,
} from '@/lib/ai-sales-admin-api';

type Props = {
  token: string;
  messageId: string;
  onClose?: () => void;
  onUpdated?: () => void;
};

type PreviewMode = 'desktop' | 'mobile' | 'dark';

export function AiSalesMessageEditorPanel({ token, messageId, onClose, onUpdated }: Props) {
  const [message, setMessage] = useState<AiSalesMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<(AiSalesApiError & { message: string }) | null>(null);
  const [tab, setTab] = useState<'preview' | 'html' | 'text' | 'knowledge' | 'reasons' | 'versions'>('preview');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  const [edit, setEdit] = useState({
    subject: '',
    preheader: '',
    greeting: '',
    intro: '',
    ctaText: '',
    ctaUrl: '',
    closing: '',
    signature: '',
    plainText: '',
  });

  const load = useCallback(async () => {
    if (!token || !messageId) return;
    setLoading(true);
    setError(null);
    try {
      const row = await getMessage(token, messageId);
      setMessage(row);
      setEdit({
        subject: row.subject ?? '',
        preheader: row.preheader ?? '',
        greeting: row.greeting ?? '',
        intro: row.intro ?? '',
        ctaText: row.ctaText ?? '',
        ctaUrl: row.ctaUrl ?? '',
        closing: row.closing ?? '',
        signature: row.signature ?? '',
        plainText: row.plainText ?? row.content ?? '',
      });
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError({
        message: err.message || 'Nepodařilo se načíst návrh.',
        code: err.code ?? 'UNKNOWN_ERROR',
        httpStatus: err.httpStatus ?? 500,
        success: false,
        phase: err.phase,
      });
    } finally {
      setLoading(false);
    }
  }, [token, messageId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!token || !message) return;
    setBusy(true);
    setError(null);
    try {
      await updateMessage(token, message.id, {
        ...edit,
        content: edit.plainText,
      });
      await load();
      onUpdated?.();
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError({
        message: err.message,
        code: err.code ?? 'UNKNOWN_ERROR',
        httpStatus: err.httpStatus ?? 500,
        success: false,
        phase: err.phase,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!token || !message) return;
    setBusy(true);
    try {
      await submitMessageForApproval(token, message.id).catch(() => null);
      await approveMessage(token, message.id);
      await load();
      onUpdated?.();
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError({ message: err.message, code: err.code ?? 'UNKNOWN_ERROR', httpStatus: err.httpStatus ?? 500, success: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!token || !message) return;
    setBusy(true);
    try {
      await sendMessage(token, message.id);
      await load();
      onUpdated?.();
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError({ message: err.message, code: err.code ?? 'UNKNOWN_ERROR', httpStatus: err.httpStatus ?? 500, success: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestSend() {
    if (!token || !message || !testEmail.trim()) return;
    setBusy(true);
    setTestResult(null);
    try {
      await sendTestMessage(token, message.id, testEmail.trim());
      setTestResult(`Testovací e-mail odeslán na ${testEmail.trim()}.`);
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : 'Test selhal.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!token || !message) return;
    setBusy(true);
    try {
      await regenerateMessage(token, message.id);
      await load();
      onUpdated?.();
    } catch (e) {
      const err = e as Error & AiSalesApiError;
      setError({ message: err.message, code: err.code ?? 'UNKNOWN_ERROR', httpStatus: err.httpStatus ?? 500, success: false, phase: err.phase });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Načítám návrh nabídky…</p>;

  if (error && !message) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">Nabídku se nepodařilo načíst</p>
        <p>Kód: {error.code} · HTTP {error.httpStatus}</p>
        {error.phase ? <p>Fáze: {error.phase}</p> : null}
        <p>{error.message}</p>
        <button type="button" className="mt-2 underline" onClick={() => void load()}>Zkusit znovu</button>
      </div>
    );
  }

  if (!message) return null;

  const recipientEmail = message.prospect?.email;
  const canSend = message.status === 'APPROVED' || message.status === 'SCHEDULED';
  const previewWidth = previewMode === 'mobile' ? 'max-w-[390px]' : 'max-w-[640px]';
  const previewBg = previewMode === 'dark' ? 'bg-zinc-900 p-4' : 'bg-zinc-100 p-4';

  return (
    <div className="space-y-4 rounded-2xl border border-orange-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Návrh nabídky · varianta {message.variantLabel ?? 'A'}</h3>
          <p className="text-xs text-zinc-500">
            {message.prospect?.companyName ?? '—'} · stav: {message.status}
            {message.analysisIncomplete ? ' · bez dokončené analýzy' : ''}
          </p>
        </div>
        {onClose ? (
          <button type="button" className="text-sm underline" onClick={onClose}>Zavřít</button>
        ) : null}
      </div>

      {!recipientEmail ? (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">
          E-mail zatím není vyplněný. Návrh můžete upravit, ale nelze jej odeslat příjemci.
        </p>
      ) : null}

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">Chyba</p>
          <p>Kód: {error.code}{error.phase ? ` · fáze: ${error.phase}` : ''}</p>
          <p>{error.message}</p>
        </div>
      ) : null}

      <div className="grid gap-3 rounded border border-zinc-100 bg-zinc-50 p-3 text-sm">
        <p><strong>Od:</strong> obchod@xxrealit.cz</p>
        <p><strong>Komu:</strong> {recipientEmail ?? '—'}</p>
        <label className="block">Předmět<input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" /></label>
        <label className="block">Preheader<input value={edit.preheader} onChange={(e) => setEdit({ ...edit, preheader: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" /></label>
        <label className="block">Oslovení<input value={edit.greeting} onChange={(e) => setEdit({ ...edit, greeting: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" /></label>
        <label className="block">Úvod<textarea value={edit.intro} onChange={(e) => setEdit({ ...edit, intro: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" rows={4} /></label>
        <label className="block">CTA text<input value={edit.ctaText} onChange={(e) => setEdit({ ...edit, ctaText: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" /></label>
        <label className="block">CTA URL<input value={edit.ctaUrl} onChange={(e) => setEdit({ ...edit, ctaUrl: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" /></label>
        <label className="block">Zakončení<textarea value={edit.closing} onChange={(e) => setEdit({ ...edit, closing: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" rows={2} /></label>
        <label className="block">Podpis<input value={edit.signature} onChange={(e) => setEdit({ ...edit, signature: e.target.value })} className="mt-1 w-full rounded border px-2 py-1" /></label>
        <label className="block">Textová verze<textarea value={edit.plainText} onChange={(e) => setEdit({ ...edit, plainText: e.target.value })} className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={8} /></label>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['preview', 'html', 'text', 'knowledge', 'reasons', 'versions'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded border px-2 py-1 text-xs ${tab === t ? 'bg-orange-100 border-orange-300' : ''}`}>
            {t === 'preview' ? 'Vizuální náhled' : t === 'html' ? 'HTML' : t === 'text' ? 'Text' : t === 'knowledge' ? 'Znalosti' : t === 'reasons' ? 'AI důvody' : 'Verze'}
          </button>
        ))}
      </div>

      {tab === 'preview' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(['desktop', 'mobile', 'dark'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setPreviewMode(m)} className={`rounded border px-2 py-1 text-xs ${previewMode === m ? 'bg-zinc-200' : ''}`}>
                {m === 'desktop' ? 'Desktop' : m === 'mobile' ? 'Mobil' : 'Tmavý režim'}
              </button>
            ))}
          </div>
          <div className={`rounded-xl ${previewBg}`}>
            <div className={`mx-auto ${previewWidth}`}>
              {message.htmlContent ? (
                <iframe title="Náhled e-mailu" srcDoc={message.htmlContent} className="w-full min-h-[480px] rounded-lg border bg-white" sandbox="" />
              ) : (
                <pre className="whitespace-pre-wrap rounded-lg border bg-white p-4 text-sm">{edit.plainText}</pre>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'html' ? <pre className="max-h-96 overflow-auto rounded bg-zinc-50 p-3 text-xs">{message.htmlContent ?? '—'}</pre> : null}
      {tab === 'text' ? <pre className="whitespace-pre-wrap rounded bg-zinc-50 p-3 text-sm">{edit.plainText}</pre> : null}
      {tab === 'knowledge' ? <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-3 text-xs">{JSON.stringify(message.knowledgeUsedJson, null, 2)}</pre> : null}
      {tab === 'reasons' ? <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-3 text-xs">{JSON.stringify(message.personalizationReasonsJson, null, 2)}</pre> : null}
      {tab === 'versions' ? <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-3 text-xs">{JSON.stringify(message.versions ?? [], null, 2)}</pre> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void handleSave()} className="rounded border px-3 py-1 text-sm">Uložit koncept</button>
        <button type="button" disabled={busy} onClick={() => void handleRegenerate()} className="rounded border px-3 py-1 text-sm">Vygenerovat znovu</button>
        <button type="button" disabled={busy} onClick={() => void handleApprove()} className="rounded bg-green-600 px-3 py-1 text-sm text-white">Schválit</button>
        <button type="button" disabled={busy || !canSend || !recipientEmail} onClick={() => void handleSend()} className="rounded bg-orange-600 px-3 py-1 text-sm text-white disabled:opacity-50">Odeslat příjemci</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <input placeholder="Testovací e-mail" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="rounded border px-2 py-1 text-sm" />
        <button type="button" disabled={busy || !testEmail.trim()} onClick={() => void handleTestSend()} className="rounded border px-3 py-1 text-sm">Odeslat testovací e-mail</button>
        {testResult ? <span className="text-xs text-zinc-600">{testResult}</span> : null}
      </div>
    </div>
  );
}
