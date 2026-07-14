'use client';

import { useState } from 'react';
import type { MetaAdSetProbeResult } from '@/lib/nest-client';

type Props = {
  probe: MetaAdSetProbeResult | null;
  busy?: boolean;
  onRun?: () => void;
  compact?: boolean;
};

export function MetaAdSetProbePanel({ probe, busy, onRun, compact }: Props) {
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  async function copyJson(data: unknown, label: string) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopyMsg(label);
      window.setTimeout(() => setCopyMsg(null), 2500);
    } catch {
      setCopyMsg('Kopírování selhalo');
    }
  }

  if (!probe && !onRun) return null;

  const failure = probe?.failureStep ?? null;

  return (
    <div
      className={`space-y-3 rounded-lg border px-3 py-2 text-xs ${
        failure?.isCode2
          ? 'border-amber-300 bg-amber-50 text-amber-950'
          : probe?.ok
            ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
            : 'border-zinc-200 bg-zinc-50 text-zinc-900'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-sm">Diagnostika Create Ad Set (postupné payloady)</p>
        {onRun ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRun}
            className="rounded-lg border border-[#1877f2] bg-white px-2 py-1 text-xs font-medium text-[#1877f2] hover:bg-blue-50 disabled:opacity-50"
          >
            {busy ? 'Probíhá…' : 'Spustit probe'}
          </button>
        ) : null}
      </div>

      {probe ? (
        <>
          <p>{probe.message}</p>
          {probe.campaignId ? (
            <p className="font-mono text-[10px]">
              Campaign ID: {probe.campaignId} · Graph {probe.graphApiVersion} · {probe.graphPath}
            </p>
          ) : null}

          {failure?.isCode2 ? (
            <div className="rounded border border-amber-400 bg-white px-2 py-2">
              <p className="mb-1 font-semibold">Code=2 po přidání pole: {failure.fieldAdded}</p>
              <ul className="mb-2 space-y-0.5 font-mono text-[10px]">
                <li>Endpoint: {failure.graphUrl}</li>
                {failure.requestId ? <li>request_id: {failure.requestId}</li> : null}
                {failure.fbtraceId ? <li>fbtrace_id: {failure.fbtraceId}</li> : null}
                {failure.traceId && failure.traceId !== failure.fbtraceId ? (
                  <li>trace_id: {failure.traceId}</li>
                ) : null}
              </ul>
              <p className="font-medium">Request</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 font-mono text-[10px]">
                {JSON.stringify(
                  { payload: failure.payload, metaForm: failure.metaForm },
                  null,
                  2,
                )}
              </pre>
              <p className="mt-2 font-medium">Response</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 font-mono text-[10px]">
                {JSON.stringify(failure.response, null, 2)}
              </pre>
            </div>
          ) : null}

          {!compact && probe.v25Validation?.length ? (
            <div>
              <p className="mb-1 font-medium">Ověření v25 (Catalog Sales)</p>
              <ul className="space-y-1">
                {probe.v25Validation.map((row) => (
                  <li key={row.field} className="rounded border border-white/80 bg-white/70 px-2 py-1">
                    <span className="font-medium">{row.field}</span>
                    {row.value ? ` = ${row.value}` : ''} — {row.note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!compact && probe.recommendedPayload ? (
            <details className="rounded border border-white/80 bg-white/70 px-2 py-1">
              <summary className="cursor-pointer font-medium">Doporučený finální payload (podporovaná pole)</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[10px]">
                {JSON.stringify(
                  {
                    payload: probe.recommendedPayload,
                    metaForm: probe.recommendedMetaForm,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          ) : null}

          {!compact && probe.steps?.length ? (
            <div className="space-y-1">
              <p className="font-medium">Kroky probe</p>
              {probe.steps.map((step) => (
                <details
                  key={step.key}
                  className="rounded border border-white/80 bg-white/70 px-2 py-1"
                  open={failure?.key === step.key}
                >
                  <summary className="cursor-pointer">
                    {step.ok ? '✓' : '✗'} {step.step}. {step.label}
                    {step.fieldAdded ? ` (+${step.fieldAdded})` : ''}
                    {step.isCode2 ? ' — code=2' : ''}
                  </summary>
                  <div className="mt-2 space-y-2 font-mono text-[10px]">
                    <p>{step.graphUrl}</p>
                    {step.requestId ? <p>request_id: {step.requestId}</p> : null}
                    {step.fbtraceId ? <p>fbtrace_id: {step.fbtraceId}</p> : null}
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2">
                      {JSON.stringify(step.response, null, 2)}
                    </pre>
                  </div>
                </details>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyJson(probe, 'Probe JSON zkopírován')}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-medium hover:bg-zinc-50"
            >
              Kopírovat výsledek
            </button>
          </div>
        </>
      ) : (
        <p className="text-zinc-600">
          Postupně odešle 8 testovacích Ad Set payloadů a zastaví se u první chyby (typicky code=2).
        </p>
      )}

      {copyMsg ? <p className="text-emerald-800">{copyMsg}</p> : null}
    </div>
  );

}
