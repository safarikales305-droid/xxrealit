import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  extractSafeMetaError,
  type MetaSafeErrorDetail,
} from './meta-center-safe-response.util';
import {
  extractMetaGraphErrorFields,
  formatMetaGraphErrorMessage,
  type MetaGraphErrorBody,
} from './meta-graph-error.util';

@Injectable()
export class MetaCenterApiLogService {
  private readonly logger = new Logger(MetaCenterApiLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logMarketingOAuthStep(input: {
    step: string;
    request?: unknown;
    response?: unknown;
    httpStatus?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
  }): Promise<void> {
    const body =
      input.response && typeof input.response === 'object'
        ? (input.response as MetaGraphErrorBody)
        : null;
    const graphFields = body ? extractMetaGraphErrorFields(body) : null;
    const errorMessage =
      input.errorMessage ??
      (body?.error
        ? formatMetaGraphErrorMessage(body, input.httpStatus)
        : null);

    try {
      await this.prisma.metaCenterApiLog.create({
        data: {
          endpoint: `MARKETING OAuth: ${input.step}`,
          method: 'CALLBACK',
          request: this.toJson(input.request),
          response: this.toJson(input.response),
          httpStatus: input.httpStatus ?? null,
          errorCode: input.errorCode ?? graphFields?.code ?? null,
          errorMessage,
          durationMs: input.durationMs ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Marketing OAuth log write failed (${input.step}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  async logCatalogGraphCall(input: {
    endpoint: string;
    query?: Record<string, string>;
    scopes: string[];
    response: unknown;
    httpStatus?: number | null;
    errorMessage?: string | null;
    durationMs?: number | null;
  }): Promise<void> {
    const body =
      input.response && typeof input.response === 'object'
        ? (input.response as MetaGraphErrorBody)
        : null;
    const graphFields = body ? extractMetaGraphErrorFields(body) : null;
    const errorMessage =
      input.errorMessage ??
      (body?.error ? formatMetaGraphErrorMessage(body, input.httpStatus) : null);

    try {
      await this.prisma.metaCenterApiLog.create({
        data: {
          endpoint: `catalog-graph:${input.endpoint}`,
          method: 'GET',
          request: this.toJson({
            endpoint: input.endpoint,
            query: input.query ?? {},
            accessTokenScopes: input.scopes,
          }),
          response: this.toJson(input.response),
          httpStatus: input.httpStatus ?? null,
          errorCode: graphFields?.code ?? null,
          errorMessage,
          durationMs: input.durationMs ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Catalog graph log write failed (${input.endpoint}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async logInternalError(
    endpoint: string,
    err: unknown,
    httpStatus: number | null = 500,
  ): Promise<MetaSafeErrorDetail> {
    const detail = extractSafeMetaError(err, endpoint);
    this.logger.warn(
      `[meta-center] ${endpoint} failed: ${detail.message}${detail.code != null ? ` (#${detail.code})` : ''}`,
    );
    try {
      await this.prisma.metaCenterApiLog.create({
        data: {
          endpoint: `meta-center:${endpoint}`,
          method: 'INTERNAL',
          request: { endpoint } as Prisma.InputJsonValue,
          response: {
            safeError: detail,
            internalMessage: err instanceof Error ? err.message : String(err),
          } as Prisma.InputJsonValue,
          httpStatus,
          errorCode: detail.code != null ? String(detail.code) : 'internal_error',
          errorMessage: detail.message,
        },
      });
    } catch (logErr) {
      this.logger.warn(
        `Meta API log write failed: ${logErr instanceof Error ? logErr.message : logErr}`,
      );
    }
    return detail;
  }
}
