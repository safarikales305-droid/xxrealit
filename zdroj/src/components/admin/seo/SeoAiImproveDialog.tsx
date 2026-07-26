'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestAdminOpenAiStatus,
  nestAdminSeoAiApply,
  nestAdminSeoAiImprove,
  nestAdminSeoAiReject,
  type NestAdminSeoAiProposal,
} from '@/lib/nest-client';
import type { SeoPageContentRow } from '@/lib/nest-client';

type Props = {
  token: string;
  contentId: string;
  row: SeoPageContentRow;
  onApplied: (page: SeoPageContentRow) => void;
};

export function SeoAiImproveDialog({ token, contentId, row, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [proposal, setProposal] = useState<NestAdminSeoAiProposal | null>(null);

  const checkAi = useCallback(async () => {
    try {
      const status = await nestAdminOpenAiStatus(token);
      setAiReady(Boolean(status.configured && status.enabled && status.seoEnabled));
    } catch {
      setAiReady(false);
    }
  }, [token]);

  useEffect(() => {
    void checkAi();
  }, [checkAi]);

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await nestAdminSeoAiImprove(token, contentId);
      setProposal(res);
      setOpen(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'AI generování selhalo');
    } finally {
      setBusy(false);
    }
  }

  async function applyProposal() {
    if (!proposal) return;
    setBusy(true);
    try {
      const res = await nestAdminSeoAiApply(token, proposal.generationId);
      onApplied(res.page as SeoPageContentRow);
      setOpen(false);
      setProposal(null);
      setMsg('AI návrh byl použit jako koncept (DRAFT). Publikujte ručně po kontrole.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Použití návrhu selhalo');
    } finally {
      setBusy(false);
    }
  }

  async function rejectProposal() {
    if (!proposal) return;
    setBusy(true);
    try {
      await nestAdminSeoAiReject(token, proposal.generationId);
      setOpen(false);
      setProposal(null);
      setMsg('AI návrh byl zamítnut.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  if (!aiReady) return null;

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void generate()}
        className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm text-violet-800"
      >
        {busy ? 'Generuji…' : 'Vylepšit obsah pomocí AI'}
      </button>
      {msg ? <p className="mt-2 text-sm text-zinc-600">{msg}</p> : null}

      {open && proposal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">AI návrh obsahu</h3>
            <p className="mb-4 text-sm text-zinc-600">
              {proposal.context.offerLabel} — {proposal.context.locationName} · Model: {proposal.model}
            </p>

            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <CompareBlock title="Současný text" body={formatCurrent(row)} />
              <CompareBlock title="AI návrh" body={formatProposal(proposal)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyProposal()}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white"
              >
                Použít návrh
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void generate()}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Vygenerovat znovu
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void rejectProposal()}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700"
              >
                Zamítnout
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Zavřít
              </button>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              AI návrh se automaticky nepublikuje. Po použití zkontrolujte obsah a publikujte ručně.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CompareBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3">
      <h4 className="mb-2 font-medium">{title}</h4>
      <pre className="whitespace-pre-wrap text-xs text-zinc-700">{body}</pre>
    </div>
  );
}

function formatCurrent(row: SeoPageContentRow): string {
  return [
    `Title: ${row.title ?? ''}`,
    `Description: ${row.description ?? ''}`,
    `H1: ${row.h1 ?? ''}`,
    `Body: ${(row.bodyText ?? '').slice(0, 800)}…`,
  ].join('\n\n');
}

function formatProposal(proposal: NestAdminSeoAiProposal): string {
  const p = proposal.proposal;
  return [
    `Title: ${p.metaTitle}`,
    `Description: ${p.metaDescription}`,
    `H1: ${p.h1}`,
    `Intro: ${p.introText}`,
    `Content: ${p.mainContent.slice(0, 600)}…`,
    `FAQ: ${p.faq.length} položek`,
  ].join('\n\n');
}
