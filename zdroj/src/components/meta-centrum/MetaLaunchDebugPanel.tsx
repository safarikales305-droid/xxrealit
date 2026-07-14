'use client';

import { useMemo, useState } from 'react';
import type { MetaCatalogCombinationDiagnostics, MetaCampaignCreateResponse, MetaLaunchDebugTrace } from '@/lib/nest-client';
import { MetaAdSetProbePanel } from '@/components/meta-centrum/MetaAdSetProbePanel';

const GRAPH_EXPLORER_URL = 'https://developers.facebook.com/tools/explorer/';

const STEP_LABELS: Record<string, string> = {
  campaign: 'Campaign',
  adSet: 'Ad Set',
  creative: 'Creative',
  ad: 'Ad',
};

type Props = {
  error?: MetaCampaignCreateResponse['metaApiError'];
  failedStep?: string | null;
  launchDebug?: MetaLaunchDebugTrace | null;
  combinationDiagnostics?: MetaCatalogCombinationDiagnostics | null;
  housingGeoDebug?: import('@/lib/nest-client').MetaHousingGeoDebug | null;
};

function buildExplorerExport(step: MetaLaunchDebugTrace['steps'][number]) {
  return {
    method: step.method,
    url: step.url,
    body: step.metaForm,
    requestPayload: step.requestPayload,
    note: 'V Graph API Exploreru zvolte POST, vložte URL a parametry z body (access_token doplníte v Exploreru).',
  };
}

function buildMetaDebugExport(
  trace: MetaLaunchDebugTrace,
  error?: MetaCampaignCreateResponse['metaApiError'],
  failedStep?: string | null,
) {
  const failedRecord = trace.steps.find((s) => {
    const key = failedStep === 'adset' ? 'adSet' : failedStep;
    return key ? s.step === key : !s.ok;
  });
  return {
    exportedAt: new Date().toISOString(),
    graphApiVersion: trace.context.graphApiVersion,
    context: trace.context,
    steps: trace.steps,
    failedStep: failedStep ?? null,
    metaError: error
      ? {
          httpStatus: error.httpStatus,
          errorCode: error.errorCode ?? null,
          errorMessage: error.errorUserMsg ?? error.response ?? null,
          requestPayload: error.requestPayload,
          metaForm: error.metaForm ?? null,
          requestUrl: error.requestUrl ?? null,
          response: error.response,
        }
      : failedRecord
        ? {
            httpStatus: failedRecord.httpStatus,
            errorCode: failedRecord.errorCode,
            errorMessage: failedRecord.errorMessage,
            requestPayload: failedRecord.requestPayload,
            metaForm: failedRecord.metaForm,
            requestUrl: failedRecord.url,
            response: failedRecord.response,
          }
        : null,
  };
}

export function MetaLaunchDebugPanel({ error, failedStep, launchDebug, combinationDiagnostics, housingGeoDebug }: Props) {
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const trace = error?.launchDebug ?? launchDebug ?? null;
  const isCode2 = error?.errorCode === '2' || error?.httpStatus === 500;
  const failedRecord = useMemo(() => {
    if (!trace?.steps?.length) return null;
    const key = failedStep === 'adset' ? 'adSet' : failedStep;
    if (key && trace.steps.find((s) => s.step === key)) {
      return trace.steps.find((s) => s.step === key) ?? null;
    }
    return [...trace.steps].reverse().find((s) => !s.ok) ?? trace.steps[trace.steps.length - 1];
  }, [trace, failedStep]);

  if (!error && !trace) return null;

  async function copyJson(data: unknown, label: string) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopyMsg(label);
      window.setTimeout(() => setCopyMsg(null), 2500);
    } catch {
      setCopyMsg('Kopírování selhalo');
    }
  }

  function downloadMetaDebugJson() {
    if (!trace) return;
    const blob = new Blob(
      [JSON.stringify(buildMetaDebugExport(trace, error, failedStep), null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meta-debug.json';
    a.click();
    URL.revokeObjectURL(url);
    setCopyMsg('meta-debug.json stažen');
    window.setTimeout(() => setCopyMsg(null), 2500);
  }

  const explorerExport = failedRecord ? buildExplorerExport(failedRecord) : null;
  const code2Request = error?.metaForm
    ? {
        method: error.requestMethod ?? 'POST',
        url: error.requestUrl,
        metaForm: error.metaForm,
        requestPayload: error.requestPayload,
        response: error.response,
      }
    : failedRecord
      ? {
          method: failedRecord.method,
          url: failedRecord.url,
          metaForm: failedRecord.metaForm,
          requestPayload: failedRecord.requestPayload,
          response: failedRecord.response,
        }
      : null;

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-950">
      {failedStep ? (
        <p className="font-semibold text-sm">
          Proces skončil u kroku: {STEP_LABELS[failedStep === 'adset' ? 'adSet' : failedStep] ?? failedStep}
        </p>
      ) : null}

      {isCode2 && code2Request ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-2 py-2">
          <p className="mb-1 font-semibold text-amber-950">
            Meta vrátila code=2 (interní chyba) — celý request
          </p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[10px] text-zinc-900">
            {JSON.stringify(code2Request, null, 2)}
          </pre>
        </div>
      ) : null}

      {error?.contextIds ? (
        <div>
          <p className="mb-1 font-medium">Použité Meta ID</p>
          <ul className="grid gap-0.5 font-mono text-[11px] sm:grid-cols-2">
            {Object.entries(error.contextIds).map(([key, value]) => (
              <li key={key}>
                {key}: {value ?? '—'}
              </li>
            ))}
          </ul>
        </div>
      ) : trace?.context ? (
        <div>
          <p className="mb-1 font-medium">Použité Meta ID</p>
          <ul className="grid gap-0.5 font-mono text-[11px] sm:grid-cols-2">
            {Object.entries(trace.context).map(([key, value]) => (
              <li key={key}>
                {key}: {value ?? '—'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {combinationDiagnostics ? (
        <div className="rounded border border-indigo-200 bg-indigo-50 px-2 py-2 text-indigo-950">
          <p className="mb-1 font-semibold">Validace kombinace Meta API</p>
          <ul className="grid gap-0.5 font-mono text-[10px] sm:grid-cols-2">
            <li>Cíl: {combinationDiagnostics.goalLabel}</li>
            <li>Objective: {combinationDiagnostics.objective}</li>
            <li>Optimization Goal: {combinationDiagnostics.optimizationGoal}</li>
            <li>Conversion Location: {combinationDiagnostics.conversionLocation ?? '—'}</li>
            <li>Kreativa: {combinationDiagnostics.creativeType}</li>
            <li>
              Destination Type: {combinationDiagnostics.destinationType ?? '—'}
            </li>
            <li>
              Promoted Object:{' '}
              {combinationDiagnostics.promotedObject
                ? JSON.stringify(combinationDiagnostics.promotedObject)
                : combinationDiagnostics.promotedObjectSummary}
            </li>
            <li>Výsledek: {combinationDiagnostics.validationOk ? '✓ OK' : '✗ neplatná'}</li>
          </ul>
          {combinationDiagnostics.destinationTypeWarning ? (
            <p className="mt-1 text-[10px] font-semibold text-amber-900">
              {combinationDiagnostics.destinationTypeWarning}
            </p>
          ) : null}
          {combinationDiagnostics.violations.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[10px] text-red-800">
              {combinationDiagnostics.violations.map((v: { param: string; rule: string }) => (
                <li key={v.param}>
                  <span className="font-semibold">{v.param}:</span> {v.rule}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {housingGeoDebug ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-2 text-emerald-950">
          <p className="mb-1 font-semibold">Housing geo (odeslané do Meta)</p>
          <ul className="grid gap-0.5 font-mono text-[10px] sm:grid-cols-2">
            <li>City key: {housingGeoDebug.cityKey ?? '—'}</li>
            <li>Latitude: {housingGeoDebug.latitude}</li>
            <li>Longitude: {housingGeoDebug.longitude}</li>
            <li>Radius: {housingGeoDebug.radius}</li>
            <li>Distance unit: {housingGeoDebug.distanceUnit}</li>
            {housingGeoDebug.coordinateSource ? (
              <li>Zdroj souřadnic: {housingGeoDebug.coordinateSource}</li>
            ) : null}
          </ul>
          {housingGeoDebug.radiusAdjusted ? (
            <p className="mt-1 text-[10px] text-amber-900">
              Meta Housing vyžaduje minimálně 17 km. Radius byl automaticky upraven.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <ul className="space-y-0.5 font-mono text-[11px]">
          {error.requestMethod && error.requestUrl ? (
            <li>
              {error.requestMethod} {error.requestUrl}
            </li>
          ) : null}
          <li>HTTP kód: {error.httpStatus}</li>
          {error.attempts ? <li>Počet pokusů: {error.attempts}</li> : null}
          {error.errorCode ? <li>Meta error_code: {error.errorCode}</li> : null}
          {error.errorSubcode ? <li>error_subcode: {error.errorSubcode}</li> : null}
          {error.errorUserTitle ? <li>error_user_title: {error.errorUserTitle}</li> : null}
          {error.errorUserMsg ? <li>error_user_msg: {error.errorUserMsg}</li> : null}
          {error.traceId ? <li>trace_id: {error.traceId}</li> : null}
        </ul>
      ) : null}

      {trace?.steps?.length ? (
        <div className="space-y-2">
          <p className="font-medium">Průběh Meta API (request → response)</p>
          {trace.steps.map((step) => (
            <details
              key={`${step.step}-${step.url}`}
              className="rounded border border-red-100 bg-white px-2 py-1"
              open={failedRecord?.step === step.step}
            >
              <summary className="cursor-pointer font-medium">
                {step.ok ? '✓' : '✗'} {STEP_LABELS[step.step] ?? step.step} — {step.method}{' '}
                {step.url}
                {step.attempts > 1 ? ` (${step.attempts} pokusů)` : ''}
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <p className="font-medium">Graph API URL</p>
                  <p className="font-mono text-[10px] break-all">{step.url}</p>
                </div>
                <div>
                  <p className="font-medium">Request payload</p>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 font-mono text-[10px] text-zinc-800">
                    {JSON.stringify(step.requestPayload, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="font-medium">Meta form (přesně jak odchází)</p>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 font-mono text-[10px] text-zinc-800">
                    {JSON.stringify(step.metaForm, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="font-medium">Response</p>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 font-mono text-[10px] text-zinc-800">
                    {JSON.stringify(step.response, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : null}

      {error?.requestPayload ? (
        <details className="rounded border border-red-100 bg-white px-2 py-1">
          <summary className="cursor-pointer font-medium">Selhaný request payload</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[10px]">
            {JSON.stringify(error.requestPayload, null, 2)}
          </pre>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {explorerExport ? (
          <button
            type="button"
            onClick={() => void copyJson(explorerExport, 'Request zkopírován')}
            className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-medium hover:bg-red-50"
          >
            Kopírovat request
          </button>
        ) : null}
        {trace ? (
          <>
            <button
              type="button"
              onClick={() => void copyJson(trace, 'Debug trace zkopírován')}
              className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-medium hover:bg-red-50"
            >
              Kopírovat celý debug JSON
            </button>
            <button
              type="button"
              onClick={downloadMetaDebugJson}
              className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-medium hover:bg-red-50"
            >
              Exportovat meta-debug.json
            </button>
          </>
        ) : null}
        <a
          href={GRAPH_EXPLORER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[#1877f2] bg-white px-2 py-1 text-xs font-medium text-[#1877f2] hover:bg-blue-50"
        >
          Otevřít Graph API Explorer
        </a>
      </div>
      {copyMsg ? <p className="text-emerald-800">{copyMsg}</p> : null}

      {error?.adSetProbe ? (
        <MetaAdSetProbePanel probe={error.adSetProbe} compact />
      ) : null}
    </div>
  );
}
