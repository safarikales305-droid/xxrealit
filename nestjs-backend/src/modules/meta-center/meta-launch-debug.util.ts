import { Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MetaGraphResult } from './meta-graph-client.service';
import { serializePayloadForMetaApi } from './meta-campaign-payload-map.util';

export type MetaLaunchDebugStepKey = 'campaign' | 'adSet' | 'creative' | 'ad';

export type MetaLaunchDebugContext = {
  graphApiVersion: string;
  businessId: string | null;
  adAccountId: string | null;
  pageId: string | null;
  instagramBusinessId: string | null;
  pixelId: string | null;
  catalogId: string | null;
  datasetId: string | null;
  campaignId: string | null;
  adSetId: string | null;
  creativeId: string | null;
  adId: string | null;
  draftId: string;
};

export type MetaLaunchDebugStepRecord = {
  step: MetaLaunchDebugStepKey;
  method: 'POST';
  url: string;
  requestPayload: Record<string, unknown>;
  metaForm: Record<string, string>;
  response: unknown;
  httpStatus: number;
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  skipped?: boolean;
  skipReason?: string;
};

export type MetaLaunchDebugTrace = {
  context: MetaLaunchDebugContext;
  steps: MetaLaunchDebugStepRecord[];
  updatedAt: string;
};

export type MetaLaunchGraphExplorerExport = {
  method: 'POST';
  url: string;
  body: Record<string, string>;
  note: string;
};

export type MetaLaunchDebugExport = {
  exportedAt: string;
  graphApiVersion: string;
  context: MetaLaunchDebugContext;
  steps: MetaLaunchDebugStepRecord[];
  payloads: {
    campaign?: Record<string, unknown> | null;
    targeting?: Record<string, unknown> | null;
    adSet?: Record<string, unknown> | null;
    creative?: Record<string, unknown> | null;
    ad?: Record<string, unknown> | null;
  };
  graphUrls: Record<string, string>;
  failedStep?: string | null;
  metaError?: {
    httpStatus: number;
    errorCode: string | null;
    errorMessage: string | null;
    requestPayload: Record<string, unknown>;
    metaForm: Record<string, string> | null;
    response: unknown;
  } | null;
};

const logger = new Logger('MetaLaunchDebug');

function redactToken(url: string): string {
  return url.replace(/access_token=[^&]+/gi, 'access_token=[REDACTED]');
}

export function buildMetaLaunchGraphUrl(graphBase: string, graphPath: string): string {
  const base = graphBase.replace(/\/$/, '');
  const p = graphPath.startsWith('/') ? graphPath : `/${graphPath}`;
  return `${base}${p}`;
}

export class MetaLaunchStepTracer {
  private readonly steps: MetaLaunchDebugStepRecord[] = [];

  constructor(
    private readonly context: MetaLaunchDebugContext,
    private readonly graphBase: string,
    private readonly debugMode: boolean,
    private readonly debugDir: string,
  ) {}

  getTrace(): MetaLaunchDebugTrace {
    return {
      context: { ...this.context },
      steps: [...this.steps],
      updatedAt: new Date().toISOString(),
    };
  }

  updateContext(patch: Partial<MetaLaunchDebugContext>): void {
    Object.assign(this.context, patch);
  }

  recordSkipped(
    step: MetaLaunchDebugStepKey,
    path: string,
    payload: Record<string, unknown>,
    reason: string,
  ): void {
    const url = buildMetaLaunchGraphUrl(this.graphBase, path);
    const metaForm = serializePayloadForMetaApi(payload);
    const record: MetaLaunchDebugStepRecord = {
      step,
      method: 'POST',
      url,
      requestPayload: payload,
      metaForm,
      response: { skipped: true, reason },
      httpStatus: 0,
      ok: true,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      skipped: true,
      skipReason: reason,
    };
    this.steps.push(record);
    this.logStep(record);
    void this.writeDebugFiles(step, record);
  }

  recordResult<T>(
    step: MetaLaunchDebugStepKey,
    path: string,
    payload: Record<string, unknown>,
    result: MetaGraphResult<T> & { attempts?: number },
  ): MetaLaunchDebugStepRecord {
    const url = buildMetaLaunchGraphUrl(this.graphBase, path);
    const metaForm = serializePayloadForMetaApi(payload);
    const record: MetaLaunchDebugStepRecord = {
      step,
      method: 'POST',
      url,
      requestPayload: payload,
      metaForm,
      response: result.ok ? result.data : result.data ?? { errorMessage: result.errorMessage },
      httpStatus: result.httpStatus,
      ok: result.ok,
      errorCode: result.ok ? null : result.errorCode,
      errorMessage: result.ok ? null : result.errorMessage,
      attempts: result.attempts ?? 1,
    };
    this.steps.push(record);
    this.logStep(record);
    void this.writeDebugFiles(step, record);
    return record;
  }

  toGraphExplorerExport(step: MetaLaunchDebugStepKey): MetaLaunchGraphExplorerExport | null {
    const found = this.steps.find((s) => s.step === step);
    if (!found) return null;
    return {
      method: 'POST',
      url: found.url,
      body: found.metaForm,
      note: 'V Graph API Exploreru zvolte POST, vložte URL bez access_token a parametry z body.',
    };
  }

  private logStep(record: MetaLaunchDebugStepRecord): void {
    const header = `[meta-launch] ${record.step.toUpperCase()} ${record.method} ${redactToken(record.url)}`;
    logger.log(
      `${header}\ncontext=${JSON.stringify(this.context, null, 2)}\nrequest=${JSON.stringify(record.requestPayload, null, 2)}\nmetaForm=${JSON.stringify(record.metaForm, null, 2)}\nresponse=${JSON.stringify(record.response, null, 2)}\nhttpStatus=${record.httpStatus} attempts=${record.attempts}${record.errorCode ? ` errorCode=${record.errorCode}` : ''}`,
    );
  }

  private async writeDebugFiles(
    step: MetaLaunchDebugStepKey,
    record: MetaLaunchDebugStepRecord,
  ): Promise<void> {
    if (!this.debugMode) return;
    try {
      const dir = path.join(this.debugDir, this.context.draftId);
      fs.mkdirSync(dir, { recursive: true });
      const prefix = step === 'adSet' ? 'adset' : step;
      fs.writeFileSync(
        path.join(dir, `${prefix}-request.json`),
        JSON.stringify(
          {
            context: this.context,
            method: record.method,
            url: record.url,
            payload: record.requestPayload,
            metaForm: record.metaForm,
          },
          null,
          2,
        ),
        'utf8',
      );
      fs.writeFileSync(
        path.join(dir, `${prefix}-response.json`),
        JSON.stringify(
          {
            httpStatus: record.httpStatus,
            ok: record.ok,
            attempts: record.attempts,
            errorCode: record.errorCode,
            errorMessage: record.errorMessage,
            response: record.response,
          },
          null,
          2,
        ),
        'utf8',
      );
    } catch (err) {
      logger.warn(
        `Debug file write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export function metaLaunchDebugDir(): string {
  return path.join(process.cwd(), 'logs', 'meta-debug');
}

export function buildMetaLaunchDebugExport(input: {
  trace: MetaLaunchDebugTrace;
  payloads?: {
    campaign?: Record<string, unknown> | null;
    targeting?: Record<string, unknown> | null;
    adSet?: Record<string, unknown> | null;
    creative?: Record<string, unknown> | null;
    ad?: Record<string, unknown> | null;
  };
  graphUrls?: Record<string, string>;
  failedStep?: string | null;
  metaError?: MetaLaunchDebugExport['metaError'];
}): MetaLaunchDebugExport {
  return {
    exportedAt: new Date().toISOString(),
    graphApiVersion: input.trace.context.graphApiVersion,
    context: input.trace.context,
    steps: input.trace.steps,
    payloads: input.payloads ?? {},
    graphUrls: input.graphUrls ?? {},
    failedStep: input.failedStep ?? null,
    metaError: input.metaError ?? null,
  };
}

export function writeMetaDebugJson(
  debugDir: string,
  draftId: string,
  payload: MetaLaunchDebugExport,
): string | null {
  try {
    const dir = path.join(debugDir, draftId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'meta-debug.json');
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return filePath;
  } catch (err) {
    logger.warn(`meta-debug.json write failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function isMetaInternalErrorCode2(result: MetaGraphResult<unknown>): boolean {
  if (result.ok) return false;
  return result.httpStatus === 500 && result.errorCode === '2';
}

export function metaCode2UserMessage(stepLabel: string): string {
  return `Meta API momentálně vrací interní chybu.\nKampaň byla vytvořena.\n${stepLabel} se nepodařilo vytvořit.`;
}
