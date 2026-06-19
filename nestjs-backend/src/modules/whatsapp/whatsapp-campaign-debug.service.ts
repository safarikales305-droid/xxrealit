import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type WhatsAppCampaignDebugContext = {
  action: 'test' | 'run';
  campaignId: string;
  payload?: Record<string, unknown>;
  selectedTemplate?: Record<string, unknown> | null;
  variablesCount?: number | null;
  wabaId?: string | null;
};

export type WhatsAppCampaignLastError = {
  at: string;
  action: 'test' | 'run';
  campaignId: string;
  name: string;
  message: string;
  stack?: string;
  payload?: Record<string, unknown>;
  selectedTemplate?: Record<string, unknown> | null;
  variablesCount?: number | null;
  wabaId?: string | null;
};

export type WhatsAppCampaignErrorResponse = {
  success: false;
  error: string;
  stack?: string;
};

@Injectable()
export class WhatsAppCampaignDebugService {
  private readonly logger = new Logger(WhatsAppCampaignDebugService.name);
  private lastError: WhatsAppCampaignLastError | null = null;

  getLastError(): WhatsAppCampaignLastError | null {
    return this.lastError;
  }

  recordFailure(error: unknown, context: WhatsAppCampaignDebugContext): never {
    const { name, message, statusCode } = this.normalizeError(error);

    const entry: WhatsAppCampaignLastError = {
      at: new Date().toISOString(),
      action: context.action,
      campaignId: context.campaignId,
      name,
      message,
      stack: error instanceof Error ? error.stack : undefined,
      payload: context.payload,
      selectedTemplate: context.selectedTemplate ?? null,
      variablesCount: context.variablesCount ?? null,
      wabaId: context.wabaId ?? null,
    };

    this.lastError = entry;

    this.logger.error(
      `[WhatsApp Campaign ${context.action}] failed campaignId=${context.campaignId} ` +
        `name=${name} message=${message} variablesCount=${context.variablesCount ?? '—'} ` +
        `wabaId=${context.wabaId ?? '—'}`,
    );
    if (error instanceof Error && error.stack) {
      this.logger.error(error.stack);
    }
    if (context.payload) {
      this.logger.error(`[WhatsApp Campaign ${context.action}] payload=${JSON.stringify(context.payload)}`);
    }
    if (context.selectedTemplate) {
      this.logger.error(
        `[WhatsApp Campaign ${context.action}] selectedTemplate=${JSON.stringify(context.selectedTemplate)}`,
      );
    }

    const body: WhatsAppCampaignErrorResponse = {
      success: false,
      error: message,
      ...(process.env.NODE_ENV !== 'production' && error instanceof Error && error.stack
        ? { stack: error.stack }
        : {}),
    };

    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        body.error = response;
      } else if (response && typeof response === 'object') {
        const r = response as Record<string, unknown>;
        if (typeof r.error === 'string') body.error = r.error;
        else if (typeof r.message === 'string') body.error = r.message;
        else if (Array.isArray(r.message)) body.error = r.message.map(String).join(', ');
        if (r.metaError && typeof r.metaError === 'object') {
          (body as Record<string, unknown>).metaError = r.metaError;
        }
      }
      throw new HttpException(body, error.getStatus());
    }

    throw new HttpException(body, statusCode);
  }

  private normalizeError(error: unknown): {
    name: string;
    message: string;
    statusCode: number;
  } {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      let message = error.message;
      if (typeof response === 'string') {
        message = response;
      } else if (response && typeof response === 'object') {
        const r = response as Record<string, unknown>;
        if (typeof r.message === 'string') message = r.message;
        else if (Array.isArray(r.message)) message = r.message.map(String).join(', ');
        else if (typeof r.error === 'string') message = r.error;
      }
      return { name: error.name, message, statusCode: error.getStatus() };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        name: error.name,
        message: `Chyba databáze (${error.code}): ${error.message}`,
        statusCode: 400,
      };
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      return {
        name: error.name,
        message: `Neplatný dotaz do databáze: ${error.message}`,
        statusCode: 400,
      };
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message || 'Neznámá chyba',
        statusCode: 500,
      };
    }

    return {
      name: 'UnknownError',
      message: String(error),
      statusCode: 500,
    };
  }
}
