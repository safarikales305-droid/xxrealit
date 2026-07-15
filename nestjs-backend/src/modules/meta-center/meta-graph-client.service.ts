import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { GRAPH_API } from '../social/facebook/facebook-page.constants';
import {
  type MetaGraphErrorBody,
  formatMetaGraphErrorMessage,
} from './meta-graph-error.util';

type GraphErrorBody = MetaGraphErrorBody;

function redactToken(url: string): string {
  return url.replace(/access_token=[^&]+/gi, 'access_token=[REDACTED]');
}

export type MetaGraphResult<T> = {
  ok: true;
  data: T;
  httpStatus: number;
  requestUrl: string;
  requestMethod: 'GET' | 'POST' | 'DELETE';
} | {
  ok: false;
  httpStatus: number;
  errorCode: string | null;
  errorMessage: string;
  data: GraphErrorBody | null;
  requestUrl: string;
  requestMethod: 'GET' | 'POST' | 'DELETE';
};

export function getMetaGraphResultErrorMessage(
  result: MetaGraphResult<unknown>,
): string | null {
  if (result.ok) return null;
  return result.errorMessage;
}

@Injectable()
export class MetaGraphClientService {
  private readonly logger = new Logger(MetaGraphClientService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fbConfig: FacebookConfigService,
  ) {}

  graphBase(version?: string): string {
    const v = version?.trim() || this.fbConfig.getGraphApiVersion();
    return `https://graph.facebook.com/${v.startsWith('v') ? v : `v${v}`}`;
  }

  private toInputJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async logCall(input: {
    endpoint: string;
    method: string;
    request?: unknown;
    response?: unknown;
    httpStatus?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs?: number;
  }) {
    try {
      await this.prisma.metaCenterApiLog.create({
        data: {
          endpoint: input.endpoint,
          method: input.method,
          request: this.toInputJson(input.request),
          response: this.toInputJson(input.response),
          httpStatus: input.httpStatus ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          durationMs: input.durationMs ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Meta API log write failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async get<T>(path: string, accessToken: string, query?: Record<string, string>): Promise<MetaGraphResult<T>> {
    return this.getWithResponseHeaders<T>(path, accessToken, query);
  }

  async getWithResponseHeaders<T>(
    path: string,
    accessToken: string,
    query?: Record<string, string>,
  ): Promise<MetaGraphResult<T> & { responseHeaders: Record<string, string> }> {
    const started = Date.now();
    const base = this.graphBase();
    const qs = new URLSearchParams({ access_token: accessToken, ...(query ?? {}) });
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}?${qs.toString()}`;
    const endpoint = path.split('?')[0] ?? path;
    const httpRequest = `GET ${base}${path.startsWith('/') ? path : `/${path}`}?${new URLSearchParams({
      ...(query ?? {}),
      access_token: '[REDACTED]',
    }).toString()}`;

    try {
      const res = await fetch(url);
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });
      const data = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
      const durationMs = Date.now() - started;

      if (!res.ok || data.error) {
        const errorMessage = formatMetaGraphErrorMessage(data, res.status);
        await this.logCall({
          endpoint,
          method: 'GET',
          request: { path, query, httpRequest },
          response: data,
          httpStatus: res.status,
          errorCode: data.error?.code != null ? String(data.error.code) : null,
          errorMessage,
          durationMs,
        });
        return {
          ok: false,
          httpStatus: res.status,
          errorCode: data.error?.code != null ? String(data.error.code) : null,
          errorMessage,
          data,
          requestUrl: redactToken(url),
          requestMethod: 'GET',
          responseHeaders,
        };
      }

      await this.logCall({
        endpoint,
        method: 'GET',
        request: { path, query, httpRequest },
        response: data,
        httpStatus: res.status,
        durationMs,
      });
      return {
        ok: true,
        data,
        httpStatus: res.status,
        requestUrl: redactToken(url),
        requestMethod: 'GET',
        responseHeaders,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.logCall({
        endpoint,
        method: 'GET',
        request: { path, query },
        httpStatus: 0,
        errorMessage,
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        httpStatus: 0,
        errorCode: null,
        errorMessage,
        data: null,
        requestUrl: redactToken(url),
        requestMethod: 'GET',
        responseHeaders: {},
      };
    }
  }

  private isRetryableMetaServerError(result: MetaGraphResult<unknown>): boolean {
    if (result.ok) return false;
    return result.httpStatus === 500 && result.errorCode === '2';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * POST s automatickým retry při Meta interní chybě (HTTP 500, error_code 2).
   */
  async postWithTransientRetry<T>(
    path: string,
    accessToken: string,
    body: Record<string, unknown>,
    options?: { retryDelaysMs?: number[]; logLabel?: string },
  ): Promise<MetaGraphResult<T> & { attempts: number }> {
    const delays = options?.retryDelaysMs ?? [3000, 3000, 3000];
    let last = await this.post<T>(path, accessToken, body);
    let attempts = 1;

    for (const delayMs of delays) {
      if (!this.isRetryableMetaServerError(last)) {
        return { ...last, attempts };
      }
      const errCode = last.ok ? null : last.errorCode;
      this.logger.warn(
        `[meta-graph] retryable ${options?.logLabel ?? path} HTTP ${last.httpStatus} code=${errCode} — retry za ${delayMs}ms (pokus ${attempts + 1}/${delays.length + 1})`,
      );
      await this.sleep(delayMs);
      last = await this.post<T>(path, accessToken, body);
      attempts += 1;
    }

    if (this.isRetryableMetaServerError(last)) {
      this.logger.error(
        `[meta-graph] retryable ${options?.logLabel ?? path} selhalo po ${attempts} pokusech`,
      );
    }
    return { ...last, attempts };
  }

  async post<T>(
    path: string,
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<MetaGraphResult<T>> {
    return this.postWithResponseHeaders<T>(path, accessToken, body);
  }

  async postWithResponseHeaders<T>(
    path: string,
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<MetaGraphResult<T> & { responseHeaders: Record<string, string> }> {
    const started = Date.now();
    const base = this.graphBase();
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const endpoint = path.split('?')[0] ?? path;
    const form = new URLSearchParams();
    form.set('access_token', accessToken);
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'boolean') {
        form.set(k, v ? 'true' : 'false');
      } else {
        form.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    }
    const httpRequest = `POST ${base}${path.startsWith('/') ? path : `/${path}`}`;

    try {
      const res = await fetch(url, { method: 'POST', body: form });
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });
      const data = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
      const durationMs = Date.now() - started;

      if (!res.ok || data.error) {
        const errorMessage = formatMetaGraphErrorMessage(data, res.status);
        await this.logCall({
          endpoint,
          method: 'POST',
          request: { body, httpRequest },
          response: data,
          httpStatus: res.status,
          errorCode: data.error?.code != null ? String(data.error.code) : null,
          errorMessage,
          durationMs,
        });
        return {
          ok: false,
          httpStatus: res.status,
          errorCode: data.error?.code != null ? String(data.error.code) : null,
          errorMessage,
          data,
          requestUrl: httpRequest,
          requestMethod: 'POST',
          responseHeaders,
        };
      }

      await this.logCall({
        endpoint,
        method: 'POST',
        request: { body, httpRequest },
        response: data,
        httpStatus: res.status,
        durationMs,
      });
      return {
        ok: true,
        data,
        httpStatus: res.status,
        requestUrl: httpRequest,
        requestMethod: 'POST',
        responseHeaders,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.logCall({
        endpoint,
        method: 'POST',
        request: body,
        httpStatus: 0,
        errorMessage,
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        httpStatus: 0,
        errorCode: null,
        errorMessage,
        data: null,
        requestUrl: httpRequest,
        requestMethod: 'POST',
        responseHeaders: {},
      };
    }
  }

  async delete<T>(path: string, accessToken: string): Promise<MetaGraphResult<T>> {
    const started = Date.now();
    const base = this.graphBase();
    const qs = new URLSearchParams({ access_token: accessToken });
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}?${qs.toString()}`;
    const endpoint = path.split('?')[0] ?? path;

    try {
      const res = await fetch(url, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
      const durationMs = Date.now() - started;

      if (!res.ok || data.error) {
        const errorMessage = formatMetaGraphErrorMessage(data, res.status);
        await this.logCall({
          endpoint,
          method: 'DELETE',
          request: { path },
          response: data,
          httpStatus: res.status,
          errorCode: data.error?.code != null ? String(data.error.code) : null,
          errorMessage,
          durationMs,
        });
        return {
          ok: false,
          httpStatus: res.status,
          errorCode: data.error?.code != null ? String(data.error.code) : null,
          errorMessage,
          data,
          requestUrl: redactToken(url),
          requestMethod: 'DELETE',
        };
      }

      await this.logCall({
        endpoint,
        method: 'DELETE',
        request: { path },
        response: data,
        httpStatus: res.status,
        durationMs,
      });
      return {
        ok: true,
        data,
        httpStatus: res.status,
        requestUrl: redactToken(url),
        requestMethod: 'DELETE',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.logCall({
        endpoint,
        method: 'DELETE',
        request: { path },
        httpStatus: 0,
        errorMessage,
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        httpStatus: 0,
        errorCode: null,
        errorMessage,
        data: null,
        requestUrl: redactToken(url),
        requestMethod: 'DELETE',
      };
    }
  }

  oauthDialogUrl(): string {
    return `https://www.facebook.com/${this.fbConfig.getGraphApiVersion()}/dialog/oauth`;
  }

  legacyGraphApi(): string {
    return GRAPH_API;
  }
}
