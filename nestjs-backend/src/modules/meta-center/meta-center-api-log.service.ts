import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  extractSafeMetaError,
  type MetaSafeErrorDetail,
} from './meta-center-safe-response.util';

@Injectable()
export class MetaCenterApiLogService {
  private readonly logger = new Logger(MetaCenterApiLogService.name);

  constructor(private readonly prisma: PrismaService) {}

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
