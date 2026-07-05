import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FacebookConfigService } from '../social/facebook/facebook-config.service';
import { GRAPH_API } from '../social/facebook/facebook-page.constants';

type GraphErrorBody = {
  error?: { message?: string; code?: number; type?: string };
};

export type MetaGraphResult<T> = {
  ok: true;
  data: T;
  httpStatus: number;
} | {
  ok: false;
  httpStatus: number;
  errorCode: string | null;
  errorMessage: string;
  data: GraphErrorBody | null;
};

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
    const started = Date.now();
    const base = this.graphBase();
    const qs = new URLSearchParams({ access_token: accessToken, ...(query ?? {}) });
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}?${qs.toString()}`;
    const endpoint = path.split('?')[0] ?? path;

    try {
      const res = await fetch(url);
      const data = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
      const durationMs = Date.now() - started;

      if (!res.ok || data.error) {
        const errorMessage =
          typeof data.error?.message === 'string' ? data.error.message : `HTTP ${res.status}`;
        await this.logCall({
          endpoint,
          method: 'GET',
          request: { path, query },
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
        };
      }

      await this.logCall({
        endpoint,
        method: 'GET',
        request: { path, query },
        response: data,
        httpStatus: res.status,
        durationMs,
      });
      return { ok: true, data, httpStatus: res.status };
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
      return { ok: false, httpStatus: 0, errorCode: null, errorMessage, data: null };
    }
  }

  async post<T>(
    path: string,
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<MetaGraphResult<T>> {
    const started = Date.now();
    const base = this.graphBase();
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const endpoint = path.split('?')[0] ?? path;
    const form = new URLSearchParams();
    form.set('access_token', accessToken);
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      form.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }

    try {
      const res = await fetch(url, { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
      const durationMs = Date.now() - started;

      if (!res.ok || data.error) {
        const errorMessage =
          typeof data.error?.message === 'string' ? data.error.message : `HTTP ${res.status}`;
        await this.logCall({
          endpoint,
          method: 'POST',
          request: body,
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
        };
      }

      await this.logCall({
        endpoint,
        method: 'POST',
        request: body,
        response: data,
        httpStatus: res.status,
        durationMs,
      });
      return { ok: true, data, httpStatus: res.status };
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
      return { ok: false, httpStatus: 0, errorCode: null, errorMessage, data: null };
    }
  }

  oauthDialogUrl(): string {
    return `https://www.facebook.com/${this.fbConfig.getGraphApiVersion()}/dialog/oauth`;
  }

  legacyGraphApi(): string {
    return GRAPH_API;
  }
}
